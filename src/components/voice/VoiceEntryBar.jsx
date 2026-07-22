/**
 * src/components/voice/VoiceEntryBar.jsx
 *
 * Global voice-entry control for a form. Render `<VoiceEntryTrigger>` once
 * near the top of the form and `<VoiceEntryBar>` once anywhere in the tree
 * (it renders nothing until active, and is fixed-positioned so placement
 * doesn't matter). Pairs with the `useVoiceEntry` hook, which owns all the
 * sequencing logic — this file is presentation only. Mirrors
 * src/components/voice/VoiceEntryBar.jsx in the mobile app.
 */
import { Mic, Square, Loader2, X, ArrowRight, Check } from 'lucide-react'

export function VoiceEntryTrigger({ onClick, count, className = '' }) {
  if (!count) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 bg-brand-50 text-brand-700 rounded-full px-4 py-2 text-sm font-semibold hover:bg-brand-100 transition-colors ${className}`}
    >
      <Mic size={15} />
      Start Voice Entry
      <span className="text-xs font-normal text-brand-500">{count} field{count !== 1 ? 's' : ''}</span>
    </button>
  )
}

export default function VoiceEntryBar({ voiceEntry }) {
  const { active, field, index, total, state, error, toggleCapture, next, cancel } = voiceEntry
  if (!active || !field) return null

  const isLast = index === total - 1

  return (
    <div
      style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 60, width: '92%', maxWidth: 420 }}
      className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Field {index + 1} of {total}</span>
        <button type="button" onClick={cancel} className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>

      <p className="text-base font-bold text-slate-900 mt-1 mb-3 truncate">{field.label}</p>

      {error && <p className="text-xs text-danger-600 mb-2">{error}</p>}

      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={toggleCapture}
          disabled={state === 'transcribing'}
          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            state === 'listening' ? 'bg-danger-500 text-white animate-pulse'
            : state === 'transcribing' ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
          }`}
        >
          {state === 'transcribing' ? <Loader2 size={20} className="animate-spin" /> : state === 'listening' ? <Square size={18} /> : <Mic size={20} />}
        </button>
        <p className="text-xs text-slate-500">
          {state === 'listening' ? 'Listening — speak now' : state === 'transcribing' ? 'Transcribing…' : 'Click mic to (re)capture, or click Next to continue'}
        </p>
      </div>

      <button
        type="button"
        onClick={next}
        disabled={state === 'transcribing'}
        className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {isLast ? 'Done' : 'Next field'}
        {isLast ? <Check size={14} /> : <ArrowRight size={14} />}
      </button>
    </div>
  )
}
