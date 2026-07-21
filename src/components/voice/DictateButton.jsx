import { useState, useRef } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { startListening, getVoiceLanguage, LANGUAGES } from '../../services/voice'

/**
 * Drop next to any text input/textarea. Appends dictated text via onResult.
 * English streams live (interim results replace the tail as you talk);
 * local languages are record-then-transcribe (nothing appears until you
 * press stop) — that difference is real, not a bug, so the button shows
 * "Transcribing…" for the latter rather than pretending it's live too.
 */
export default function DictateButton({ onResult, className = '' }) {
  const [state, setState] = useState('idle') // idle | listening | transcribing
  const [error, setError] = useState('')
  const stopRef = useRef(null)
  const lang = getVoiceLanguage()
  const langInfo = LANGUAGES.find(l => l.code === lang)

  if (!langInfo?.dictation) return null // e.g. Hausa has no TTS but does have STT, so this only hides truly unsupported cases

  const start = () => {
    setError('')
    setState('listening')
    stopRef.current = startListening(lang, {
      onResult: (text) => onResult(text),
      onError: (err) => { setError(err.message); setState('idle') },
      onEnd: () => setState((s) => (s === 'listening' ? 'idle' : s)),
    })
    if (lang !== 'en') {
      // Backend path has no interim results — show a distinct "processing" state after stop
    }
  }

  const stop = () => {
    if (lang !== 'en') setState('transcribing')
    stopRef.current?.()
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={state === 'idle' ? start : state === 'listening' ? stop : undefined}
        disabled={state === 'transcribing'}
        title={state === 'idle' ? `Dictate in ${langInfo.label}` : state === 'listening' ? 'Stop and use this' : 'Transcribing…'}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
          state === 'listening'
            ? 'bg-danger-500 text-white animate-pulse'
            : state === 'transcribing'
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
        }`}
      >
        {state === 'transcribing' ? <Loader2 size={13} className="animate-spin"/> : state === 'listening' ? <Square size={11}/> : <Mic size={13}/>}
      </button>
      {error && <span className="text-xs text-danger-600">{error}</span>}
    </span>
  )
}
