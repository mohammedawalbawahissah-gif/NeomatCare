/**
 * src/components/ai/ANCAnomalyPanel.jsx
 *
 * AI-powered ANC visit anomaly detection.
 * Mounts inside PatientDetailPage in the ANC Visits section.
 *
 * Props:
 *   patientId   {string}  - Patient UUID
 *   visitCount  {number}  - Number of visits (to decide whether to show)
 */

import { useState, useEffect } from 'react'
import { aiApi } from '@/api/ai'
import { Sparkles, AlertTriangle, CheckCircle, Loader2, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

const SEVERITY_CONFIG = {
  high:   { color: 'text-red-700',    bg: 'bg-red-50 border-red-200',    icon: AlertTriangle },
  medium: { color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle },
  low:    { color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   icon: Info },
}

export default function ANCAnomalyPanel({ patientId, visitCount, onSpeakableText }) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const detect = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const { data } = await aiApi.ancAnomaly(patientId)
      setResult(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Anomaly detection failed.')
    } finally {
      setLoading(false)
    }
  }

  // Computed and reported before the visitCount early-return below, so this
  // hook runs unconditionally on every render (Rules of Hooks).
  const speakableText = result?.data && [
    result.data.summary,
    result.data.recommended_risk_escalation ? 'Risk level re-computed — patient risk may have escalated.' : '',
    result.data.patterns?.length
      ? `Detected patterns: ${result.data.patterns.map(p => `${p.type.replace(/_/g, ' ')}: ${p.description}`).join('. ')}.`
      : '',
  ].filter(Boolean).join(' ')
  useEffect(() => { onSpeakableText?.(speakableText || null) }, [speakableText])

  if (visitCount < 2) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
        <Info size={13} />
        AI anomaly detection requires at least 2 ANC visits.
      </div>
    )
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-800">
        <Sparkles size={14} className="text-brand-400" />
        <span className="text-white text-sm font-semibold flex-1">AI ANC Pattern Analysis</span>
        <span className="text-slate-400 text-[11px]">{visitCount} visits</span>
      </div>

      <div className="px-4 py-3">
        {!result && !loading && (
          <div>
            <p className="text-xs text-slate-600 mb-3">
              Analyse {visitCount} ANC visits for concerning trends: rising blood pressure,
              missed visits, weight changes, or fetal heart rate anomalies.
            </p>
            <button
              onClick={detect}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Sparkles size={14} />
              Analyse Visit Patterns
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-slate-600 py-1">
            <Loader2 size={15} className="animate-spin" />
            <span className="text-xs">Analysing {visitCount} ANC visits…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-danger-700 text-xs">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3 mt-1">
            {/* Overall summary */}
            <div className={clsx(
              'flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-sm',
              result.data?.anomalies_found
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            )}>
              {result.data?.anomalies_found
                ? <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                : <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
              }
              <p>{result.data?.summary}</p>
            </div>

            {/* Risk escalation alert */}
            {result.data?.recommended_risk_escalation && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                <AlertTriangle size={13} className="shrink-0" />
                Risk level re-computed — patient risk may have escalated. Refresh to see updated risk.
              </div>
            )}

            {/* Patterns */}
            {result.data?.patterns?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-600 text-slate-500 uppercase tracking-wider">Detected Patterns</p>
                {result.data.patterns.map((p, i) => {
                  const cfg = SEVERITY_CONFIG[p.severity] || SEVERITY_CONFIG.low
                  const Icon = cfg.icon
                  return (
                    <div key={i} className={clsx('flex gap-2.5 px-3 py-2.5 rounded-lg border text-xs', cfg.bg)}>
                      <Icon size={13} className={clsx('shrink-0 mt-0.5', cfg.color)} />
                      <div>
                        <p className={clsx('font-semibold mb-0.5', cfg.color)}>
                          {p.type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-slate-700">{p.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={detect}
              className="text-[11px] text-slate-500 hover:text-slate-700 underline transition-colors"
            >
              Re-analyse
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
