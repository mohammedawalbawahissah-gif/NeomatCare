/**
 * src/components/ai/RiskNarratePanel.jsx
 *
 * AI-powered plain-language risk narration for a patient's risk profile.
 * Mounts inside PatientDetailPage next to the risk badge.
 *
 * Props:
 *   patientId  {string}  - Patient UUID
 *   riskLevel  {string}  - "high" | "medium" | "low"
 *   riskFlags  {Array}   - Raw risk flag strings from backend
 */

import { useState } from 'react'
import { aiApi } from '@/api/ai'
import { Sparkles, AlertCircle, Loader2, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react'
import clsx from 'clsx'
import SpeakButton from '@/components/voice/SpeakButton'

const RISK_BORDER = {
  high:   'border-red-200 bg-red-50',
  medium: 'border-amber-200 bg-amber-50',
  low:    'border-emerald-200 bg-emerald-50',
}

const RISK_HEADER = {
  high:   'bg-red-600',
  medium: 'bg-amber-500',
  low:    'bg-emerald-600',
}

export default function RiskNarratePanel({ patientId, riskLevel, riskFlags }) {
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState(false)

  const level = riskLevel?.toLowerCase() || 'low'

  const speakableText = result && [
    result.summary,
    result.action_points?.length ? `Action points: ${result.action_points.join('. ')}.` : '',
    result.urgency_note,
  ].filter(Boolean).join(' ')

  const narrate = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const { data } = await aiApi.riskNarrate(patientId)
      setResult(data.data)
      setExpanded(true)
    } catch (err) {
      setError(err?.response?.data?.error || 'AI narration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={clsx('border rounded-xl overflow-hidden', RISK_BORDER[level] || RISK_BORDER.low)}>
      {/* Header */}
      <div className={clsx('flex items-center gap-2.5 px-4 py-2.5', RISK_HEADER[level] || RISK_HEADER.low)}>
        <Sparkles size={14} className="text-white" />
        <span className="text-white text-sm font-semibold flex-1">AI Risk Explanation</span>
        {result && <SpeakButton text={speakableText} className="!bg-white/20 !text-white hover:!bg-white/30" />}
        {result && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-white/80 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        {!result && !loading && (
          <div>
            <p className="text-xs text-slate-600 mb-2">
              Get a plain-language explanation of why this patient is{' '}
              <strong>{level} risk</strong> and what to watch for.
            </p>
            <button
              onClick={narrate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors shadow-sm"
            >
              <Sparkles size={12} />
              Explain Risk Profile
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 size={15} className="animate-spin" />
            <span className="text-xs">Generating explanation…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-danger-700 text-xs">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && expanded && (
          <div className="space-y-3 mt-1">
            {/* Summary */}
            <p className="text-sm text-slate-800 leading-relaxed">{result.summary}</p>

            {/* Action points */}
            {result.action_points?.length > 0 && (
              <div>
                <p className="text-[11px] font-600 text-slate-500 uppercase tracking-wider mb-1.5">Action Points</p>
                <ul className="space-y-1">
                  {result.action_points.map((pt, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-700">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-500 mt-0.5">
                        {i + 1}
                      </span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Urgency note */}
            {result.urgency_note && (
              <div className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-slate-100">
                <Lightbulb size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-700 italic">{result.urgency_note}</p>
              </div>
            )}

            <button
              onClick={narrate}
              className="text-[11px] text-slate-500 hover:text-slate-700 underline transition-colors"
            >
              Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
