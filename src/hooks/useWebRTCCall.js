/**
 * src/hooks/useWebRTCCall.js
 *
 * Real peer-to-peer video/audio calling for a consultation, replacing the
 * old CallPanel's local-only timer simulation. Signaling (offer/answer/ICE
 * exchange) goes through the backend by polling — see apps/consultations
 * CallSignal model/views — not a WebSocket. This app has no ASGI/Channels
 * setup and every other "live" feature here already polls (chat, dashboard
 * refresh), so this matches existing infrastructure rather than adding a
 * new kind of connection the deployment doesn't otherwise need.
 *
 * IMPORTANT LIMITATION, stated plainly rather than discovered in production:
 * this only configures public STUN servers, no TURN. STUN is enough for two
 * peers on typical home/mobile networks to find a direct path to each
 * other. It is NOT enough on networks with strict/symmetric NAT or an
 * outbound-restrictive firewall — hospital IT networks are a common example
 * of exactly that. On those networks the call will ring and connect
 * signaling-wise but audio/video will never actually flow. A real TURN
 * relay (e.g. via a hosted provider) is the fix, and is a cost/ops decision
 * — not something to silently add.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { consultationsApi } from '../api/client'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}
const POLL_INTERVAL_MS = 2000

export function useWebRTCCall(consultationId, currentUserId) {
  const [status, setStatus] = useState('idle') // idle | calling | ringing | connecting | active | ended | error
  const [callType, setCallType] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [incomingOffer, setIncomingOffer] = useState(null)
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)

  // Refs mirror state that async callbacks (the poll interval, WebRTC event
  // handlers) need to read without recreating those callbacks every render —
  // reading stale `status`/`localStream` from a closure is the classic way
  // this kind of hook silently breaks (interval keeps polling against an
  // outdated status check forever).
  const statusRef = useRef('idle')
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const pollTimerRef = useRef(null)
  const lastSeenRef = useRef(null)
  const seenIdsRef = useRef(new Set())
  const pendingIceRef = useRef([])

  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { localStreamRef.current = localStream }, [localStream])

  const teardownConnection = useCallback(() => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    setLocalStream(null)
    setRemoteStream(null)
    pendingIceRef.current = []
  }, [])

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        consultationsApi.callSignals.send(consultationId, { kind: 'ice', payload: e.candidate.toJSON() }).catch(() => {})
      }
    }
    pc.ontrack = (e) => setRemoteStream(e.streams[0])
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('active')
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setErrorMsg('Connection lost — the other side may be on a network this app can\'t traverse without a relay server.')
      }
    }
    pcRef.current = pc
    return pc
  }, [consultationId])

  const applySignal = useCallback(async (sig) => {
    if (seenIdsRef.current.has(sig.id)) return
    seenIdsRef.current.add(sig.id)
    lastSeenRef.current = sig.created_at
    if (sig.sender === currentUserId) return // don't react to our own signals echoed back by polling

    if (sig.kind === 'offer') {
      if (statusRef.current === 'idle') {
        setIncomingOffer(sig)
        setStatus('ringing')
      }
      return
    }
    if (sig.kind === 'answer') {
      const pc = pcRef.current
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(sig.payload)
        for (const c of pendingIceRef.current) await pc.addIceCandidate(c).catch(() => {})
        pendingIceRef.current = []
      }
      return
    }
    if (sig.kind === 'ice') {
      const pc = pcRef.current
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(sig.payload).catch(() => {})
      } else {
        pendingIceRef.current.push(sig.payload)
      }
      return
    }
    if (sig.kind === 'hangup') {
      if (statusRef.current !== 'idle') {
        setStatus('ended')
        teardownConnection()
        setIncomingOffer(null)
      }
    }
  }, [currentUserId, teardownConnection])

  // Poll continuously for the lifetime of the component — this is how an
  // incoming call gets detected in the first place, not just how an
  // in-progress call exchanges ICE candidates.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const { data } = await consultationsApi.callSignals.list(consultationId, lastSeenRef.current)
        for (const sig of data) {
          if (cancelled) return
          await applySignal(sig)
        }
      } catch { /* transient network hiccup — next poll retries */ }
    }
    poll()
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(pollTimerRef.current) }
  }, [consultationId, applySignal])

  const startCall = useCallback(async (type) => {
    setErrorMsg('')
    setCallType(type)
    setStatus('calling')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true })
      setLocalStream(stream)
      const pc = createPeerConnection()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await consultationsApi.callSignals.send(consultationId, {
        kind: 'offer', call_type: type, payload: { type: offer.type, sdp: offer.sdp },
      })
    } catch (err) {
      setErrorMsg(err.name === 'NotAllowedError' ? 'Camera/microphone permission was denied.' : (err.message || 'Could not start the call.'))
      setStatus('error')
    }
  }, [consultationId, createPeerConnection])

  const acceptCall = useCallback(async () => {
    if (!incomingOffer) return
    setErrorMsg('')
    setStatus('connecting')
    setCallType(incomingOffer.call_type)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: incomingOffer.call_type === 'video', audio: true })
      setLocalStream(stream)
      const pc = createPeerConnection()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      await pc.setRemoteDescription(incomingOffer.payload)
      for (const c of pendingIceRef.current) await pc.addIceCandidate(c).catch(() => {})
      pendingIceRef.current = []
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await consultationsApi.callSignals.send(consultationId, { kind: 'answer', payload: { type: answer.type, sdp: answer.sdp } })
      setIncomingOffer(null)
    } catch (err) {
      setErrorMsg(err.name === 'NotAllowedError' ? 'Camera/microphone permission was denied.' : (err.message || 'Could not join the call.'))
      setStatus('error')
    }
  }, [incomingOffer, consultationId, createPeerConnection])

  const declineCall = useCallback(() => {
    setIncomingOffer(null)
    setStatus('idle')
    consultationsApi.callSignals.send(consultationId, { kind: 'hangup', payload: {} }).catch(() => {})
  }, [consultationId])

  const endCall = useCallback(() => {
    consultationsApi.callSignals.end(consultationId).catch(() => {})
    setStatus('ended')
    teardownConnection()
  }, [consultationId, teardownConnection])

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return
    const next = !muted
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next })
    setMuted(next)
  }, [muted])

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return
    const next = !videoOff
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !next })
    setVideoOff(next)
  }, [videoOff])

  // Unmount cleanup only — deliberately empty deps, teardownConnection is stable
  useEffect(() => () => teardownConnection(), [teardownConnection])

  return {
    status, callType, errorMsg, localStream, remoteStream, incomingOffer, muted, videoOff,
    startCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo,
  }
}
