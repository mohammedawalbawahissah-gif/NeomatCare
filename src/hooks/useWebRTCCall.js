/**
 * src/hooks/useWebRTCCall.js
 *
 * Mirrors neomatcare-frontend/src/hooks/useWebRTCCall.js — identical state
 * machine (idle -> calling/ringing -> connecting -> active -> ended), same
 * polling-based signaling against the same backend endpoints. What differs
 * is only what react-native-webrtc requires explicitly that the browser
 * does implicitly:
 *   - RTCPeerConnection, mediaDevices, RTCIceCandidate are imported from
 *     the package, not read off `window`/`navigator`.
 *   - ICE candidates and session descriptions need explicit wrapper objects
 *     (`new RTCIceCandidate(payload)`) rather than the browser's looser
 *     duck-typing of plain objects.
 *   - No <video> element — screens using this hook render local/remote
 *     streams with react-native-webrtc's <RTCView streamURL={...}/>.
 *
 * SAME LIMITATION AS WEB: STUN only, no TURN configured yet. See the note
 * in the web hook — this will ring and signal correctly but audio/video
 * won't flow on networks with strict/symmetric NAT until a TURN relay is
 * added, which is a deliberate cost decision, not a default to silently add.
 *
 * REQUIRES A REBUILT APP, NOT EXPO GO: react-native-webrtc is a native
 * module. It needs `npx expo prebuild` / an EAS dev-client build with the
 * `@config-plugins/react-native-webrtc` plugin (already added to app.json)
 * — same category of constraint as @react-native-voice/voice, just with a
 * heavier native footprint (real native WebRTC libraries on each platform,
 * not just a permission + a small bridge).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { consultationsApi } from '../api/client';

// TEMP (expo-go-test branch): lazy/guarded require so this module doesn't
// crash on import in Expo Go, where react-native-webrtc's native module
// isn't linked. Mirrors the existing pattern in services/voice.js.
// Revert: restore the static `import { RTCPeerConnection, RTCIceCandidate,
// mediaDevices } from 'react-native-webrtc';` at the top of this file.
let RTCPeerConnection = null;
let RTCIceCandidate = null;
let mediaDevices = null;
try {
  ({ RTCPeerConnection, RTCIceCandidate, mediaDevices } = require('react-native-webrtc'));
} catch {
  RTCPeerConnection = null;
  RTCIceCandidate = null;
  mediaDevices = null;
}

const FALLBACK_ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
const POLL_INTERVAL_MS = 2000;

/**
 * Mirrors the web hook's fetchIceServers — fresh TURN credentials from the
 * backend (Xirsys/Twilio, whichever configured), falling back to STUN-only
 * if the fetch fails.
 */
async function fetchIceServers() {
  try {
    const { data } = await consultationsApi.iceServers();
    if (Array.isArray(data?.iceServers) && data.iceServers.length) {
      return { iceServers: data.iceServers };
    }
  } catch { /* fall through to STUN-only */ }
  return FALLBACK_ICE_SERVERS;
}

export function useWebRTCCall(consultationId, currentUserId) {
  const [status, setStatus] = useState('idle'); // idle | calling | ringing | connecting | active | ended | error
  const [callType, setCallType] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const statusRef = useRef('idle');
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const lastSeenRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const pendingIceRef = useRef([]);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  const teardownConnection = useCallback(() => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    pendingIceRef.current = [];
  }, []);

  const createPeerConnection = useCallback(async () => {
    const iceServers = await fetchIceServers();
    const pc = new RTCPeerConnection(iceServers);
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const c = e.candidate;
        consultationsApi.callSignals.send(consultationId, {
          kind: 'ice',
          payload: { candidate: c.candidate, sdpMLineIndex: c.sdpMLineIndex, sdpMid: c.sdpMid },
        }).catch(() => {});
      }
    };
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('active');
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setErrorMsg("Connection lost — the other side may be on a network this app can't traverse without a relay server.");
      }
    };
    pcRef.current = pc;
    return pc;
  }, [consultationId]);

  const applySignal = useCallback(async (sig) => {
    if (seenIdsRef.current.has(sig.id)) return;
    seenIdsRef.current.add(sig.id);
    lastSeenRef.current = sig.created_at;
    if (sig.sender === currentUserId) return;

    if (sig.kind === 'offer') {
      if (statusRef.current === 'idle') {
        setIncomingOffer(sig);
        setStatus('ringing');
      }
      return;
    }
    if (sig.kind === 'answer') {
      const pc = pcRef.current;
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(sig.payload);
        for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        pendingIceRef.current = [];
      }
      return;
    }
    if (sig.kind === 'ice') {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(sig.payload)).catch(() => {});
      } else {
        pendingIceRef.current.push(sig.payload);
      }
      return;
    }
    if (sig.kind === 'hangup') {
      if (statusRef.current !== 'idle') {
        setStatus('ended');
        teardownConnection();
        setIncomingOffer(null);
      }
    }
  }, [currentUserId, teardownConnection]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await consultationsApi.callSignals.list(consultationId, lastSeenRef.current);
        for (const sig of data) {
          if (cancelled) return;
          await applySignal(sig);
        }
      } catch { /* transient network hiccup — next poll retries */ }
    };
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [consultationId, applySignal]);

  const startCall = useCallback(async (type) => {
    setErrorMsg('');
    setCallType(type);
    setStatus('calling');
    if (!mediaDevices || !RTCPeerConnection) {
      setErrorMsg('Calling needs a rebuilt app (native module not available in Expo Go).');
      setStatus('error');
      return;
    }
    try {
      const stream = await mediaDevices.getUserMedia({ video: type === 'video', audio: true });
      setLocalStream(stream);
      const pc = await createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await consultationsApi.callSignals.send(consultationId, {
        kind: 'offer', call_type: type, payload: { type: offer.type, sdp: offer.sdp },
      });
    } catch (err) {
      setErrorMsg(err?.message?.includes('Permission') ? 'Camera/microphone permission was denied.' : (err.message || 'Could not start the call.'));
      setStatus('error');
    }
  }, [consultationId, createPeerConnection]);

  const acceptCall = useCallback(async () => {
    if (!incomingOffer) return;
    setErrorMsg('');
    setStatus('connecting');
    setCallType(incomingOffer.call_type);
    if (!mediaDevices || !RTCPeerConnection) {
      setErrorMsg('Calling needs a rebuilt app (native module not available in Expo Go).');
      setStatus('error');
      return;
    }
    try {
      const stream = await mediaDevices.getUserMedia({ video: incomingOffer.call_type === 'video', audio: true });
      setLocalStream(stream);
      const pc = await createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(incomingOffer.payload);
      for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await consultationsApi.callSignals.send(consultationId, { kind: 'answer', payload: { type: answer.type, sdp: answer.sdp } });
      setIncomingOffer(null);
    } catch (err) {
      setErrorMsg(err?.message?.includes('Permission') ? 'Camera/microphone permission was denied.' : (err.message || 'Could not join the call.'));
      setStatus('error');
    }
  }, [incomingOffer, consultationId, createPeerConnection]);

  const declineCall = useCallback(() => {
    setIncomingOffer(null);
    setStatus('idle');
    consultationsApi.callSignals.send(consultationId, { kind: 'hangup', payload: {} }).catch(() => {});
  }, [consultationId]);

  const endCall = useCallback(() => {
    consultationsApi.callSignals.end(consultationId).catch(() => {});
    setStatus('ended');
    teardownConnection();
  }, [consultationId, teardownConnection]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !videoOff;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setVideoOff(next);
  }, [videoOff]);

  useEffect(() => () => teardownConnection(), [teardownConnection]);

  return {
    status, callType, errorMsg, localStream, remoteStream, incomingOffer, muted, videoOff,
    startCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo,
  };
}
