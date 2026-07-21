/**
 * src/services/voice.js
 *
 * English uses the browser's own speechSynthesis (TTS) and
 * SpeechRecognition (STT) — free, on-device for TTS, no backend call.
 * Every other language routes through our Django backend
 * (/api/voice/transcribe/, /api/voice/synthesize/), which proxies to
 * Khaya AI (GhanaNLP) or Google Cloud STT — see apps/voice/service.py
 * for the provider routing. Mirrors src/services/voice.js in the mobile
 * app; keep the LANGUAGES list in sync with apps/voice/service.py.
 */
import { api } from '../api/client'

export const LANGUAGES = [
  { code: 'en',  label: 'English',           dictation: true,  readAloud: true },
  { code: 'tw',  label: 'Twi',               dictation: true,  readAloud: true },
  { code: 'dag', label: 'Dagbani',           dictation: true,  readAloud: true },
  { code: 'ee',  label: 'Ewe',               dictation: true,  readAloud: true },
  { code: 'gaa', label: 'Ga',                dictation: true,  readAloud: true },
  { code: 'gur', label: 'Frafra (Gurune)',   dictation: true,  readAloud: true },
  { code: 'ha',  label: 'Hausa',             dictation: true,  readAloud: false },
]

const VOICE_LANG_KEY = 'nmc_voice_language'

export function getVoiceLanguage() {
  return localStorage.getItem(VOICE_LANG_KEY) || 'en'
}

export function setVoiceLanguage(code) {
  localStorage.setItem(VOICE_LANG_KEY, code)
}

// ── Text-to-speech ──────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @param {string} lang - language code
 * @returns {Promise<void>} resolves when playback finishes
 */
export async function speak(text, lang) {
  if (!text?.trim()) return
  if (lang === 'en') {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) return reject(new Error('Speech synthesis not supported in this browser.'))
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      utterance.onend = () => resolve()
      utterance.onerror = (e) => reject(e.error || new Error('Speech synthesis failed.'))
      window.speechSynthesis.cancel() // stop anything currently playing
      window.speechSynthesis.speak(utterance)
    })
  }
  // Non-English: fetch synthesized audio from the backend and play it.
  const response = await api.post('/api/voice/synthesize/', { text, lang }, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const audio = new Audio(url)
  return new Promise((resolve, reject) => {
    audio.onended = () => { URL.revokeObjectURL(url); resolve() }
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not play audio.')) }
    audio.play().catch(reject)
  })
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel()
}

// ── Speech-to-text ──────────────────────────────────────────────────────────

let recognizer = null

/**
 * English dictation via the browser's built-in SpeechRecognition. Requires
 * network (it's a cloud-backed browser API despite being "built in") and
 * only exists in Chromium-based browsers as of this writing.
 */
function listenBrowser(lang, { onResult, onError, onEnd }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    onError?.(new Error('Dictation is not supported in this browser — try Chrome or Edge.'))
    return () => {}
  }
  recognizer = new SpeechRecognition()
  recognizer.lang = 'en-US'
  recognizer.interimResults = true
  recognizer.continuous = true

  recognizer.onresult = (event) => {
    let finalText = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript
    }
    if (finalText) onResult?.(finalText)
  }
  recognizer.onerror = (event) => onError?.(new Error(event.error || 'Dictation error.'))
  recognizer.onend = () => onEnd?.()
  recognizer.start()

  const stop = () => { try { recognizer?.stop() } catch {} }
  stop.cancel = stop
  return stop
}

/**
 * Local-language dictation: record with MediaRecorder, upload the clip to
 * the backend on stop, get back a transcript. Unlike the browser's live
 * streaming recognition, this is record-then-transcribe — there's no
 * interim/partial text, only a result once recording stops.
 */
function listenViaBackend(lang, { onResult, onError, onEnd }) {
  let mediaRecorder
  let chunks = []
  let cancelled = false

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      mediaRecorder = new MediaRecorder(stream)
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (cancelled) { onEnd?.(); return }
        try {
          const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' })
          const form = new FormData()
          form.append('audio', blob, 'dictation.webm')
          form.append('lang', lang)
          const { data } = await api.post('/api/voice/transcribe/', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          onResult?.(data.text || '')
        } catch (err) {
          onError?.(new Error(err?.response?.data?.error || 'Could not transcribe audio.'))
        } finally {
          onEnd?.()
        }
      }
      mediaRecorder.start()
    })
    .catch(() => onError?.(new Error('Microphone access is required for dictation.')))

  const stop = () => { if (mediaRecorder?.state === 'recording') mediaRecorder.stop() }
  stop.cancel = () => { cancelled = true; stop() }
  return stop
}

/**
 * Start listening. Returns a stop function; for backend-transcribed
 * languages, stopFn.cancel() discards the recording instead of
 * transcribing it (stopFn() alone always transcribes what was captured).
 * @param {string} lang
 * @param {{onResult?: (text: string) => void, onError?: (err: Error) => void, onEnd?: () => void}} handlers
 */
export function startListening(lang, handlers) {
  return lang === 'en' ? listenBrowser(lang, handlers) : listenViaBackend(lang, handlers)
}
