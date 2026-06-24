/**
 * src/components/ai/TriageAIPanel.jsx
 *
 * Inline AI panel for triage note analysis.
 * Mounted inside CaseDetailPage alongside the TriageNote form.
 *
 * Props:
 *   note       {string}   - Current triage note text
 *   caseId     {string}   - Emergency case UUID
 *   onApply    {function} - Callback({ danger_signs, presenting_complaint_suggestion })
 *                           called when health worker clicks "Apply suggestions"
 */

import { useState } from 'react'
import { aiApi } from '@/api/ai'
import { Sparkles, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

const SEVERITY_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  moderate: 'bg-amber-100 text-amber-700 border-amber-200',
  low:      'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const CONFIDENCE_COLORS = {
  high:   'text-emerald-700',
  medium: 'text-amber-700',
  low:    'text-red-600',
}

export default function TriageAIPanel({ note, caseId, onApply }) {
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState(true)

  const analyse = async () => {
    if (!note?.trim()) { setError('Please write a triage note first.'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const { data } = await aiApi.triageExtract(note, caseId)
      setResult(data.data)
    } catch (err) {
      setError(err?.response?.data?.error || 'AI analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (!result) return
    onApply?.({
      danger_signs: result.danger_signs || [],
      presenting_complaint_suggestion: result.presenting_complaint_suggestion || '',
    })
  }

  return (
    <div className="border border-brand-200 rounded-xl bg-brand-50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-brand-100/50 transition-colors"
      >
        <div className="w-6 h-6 bg-brand-600 rounded-md flex items-center justify-center shrink-0">
          <Sparkles size={13} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-brand-800 flex-1 text-left">
          AI Triage Analysis
        </span>
        <span className="text-[11px] text-brand-600 mr-1">
          {result ? 'Results ready' : 'Analyse note'}
        </span>
        {expanded ? <ChevronUp size={15} className="text-brand-500" /> : <ChevronDown size={15} className="text-brand-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-brand-100">
          {/* Analyse button */}
          {!result && !loading && (
            <div className="pt-3">
              <p className="text-xs text-brand-700 mb-3">
                Click "Analyse" to have the AI extract danger signs, severity, and identify missing clinical fields from your triage note.
              </p>
              <button
                onClick={analyse}
                disabled={!note?.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={14} />
                Analyse Triage Note
              </button>
            </div>
          )}

          {loading && (
            <div className="pt-3 flex items-center gap-3 text-brand-700">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Analysing with AI…</span>
            </div>
          )}

          {error && (
            <div className="pt-3 flex items-start gap-2 text-danger-700 text-sm">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="pt-3 space-y-3">
              {/* Severity + Confidence */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('text-xs px-2.5 py-1 rounded-full border font-medium', SEVERITY_COLORS[result.severity])}>
                  {result.severity?.toUpperCase()} SEVERITY
                </span>
                <span className={clsx('text-xs font-medium', CONFIDENCE_COLORS[result.confidence])}>
                  {result.confidence} confidence
                </span>
              </div>

              {/* Detected danger signs */}
              {result.danger_signs?.length > 0 && (
                <div>
                  <p className="text-[11px] font-600 text-slate-500 uppercase tracking-wider mb-1.5">
                    Detected Danger Signs
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.danger_signs.map(sign => (
                      <span key={sign} className="text-xs px-2 py-0.5 bg-danger-100 text-danger-700 rounded-full font-medium">
                        {sign.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key observations */}
              {result.key_observations?.length > 0 && (
                <div>
                  <p className="text-[11px] font-600 text-slate-500 uppercase tracking-wider mb-1.5">
                    Key Observations
                  </p>
                  <ul className="space-y-1">
                    {result.key_observations.map((obs, i) => (
                      <li key={i} className="text-xs text-slate-700 flex gap-2">
                        <span className="text-brand-500 mt-1 shrink-0">•</span>
                        {obs}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Presenting complaint suggestion */}
              {result.presenting_complaint_suggestion && (
                <div>
                  <p className="text-[11px] font-600 text-slate-500 uppercase tracking-wider mb-1.5">
                    Suggested Presenting Complaint
                  </p>
                  <p className="text-xs text-slate-700 italic bg-white rounded-lg px-3 py-2 border border-slate-100">
                    "{result.presenting_complaint_suggestion}"
                  </p>
                </div>
              )}

              {/* Missing fields */}
              {result.missing_fields?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] font-600 text-amber-800 uppercase tracking-wider mb-1">
                    Missing Clinical Fields
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.missing_fields.map(f => (
                      <span key={f} className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleApply}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <CheckCircle size={12} />
                  Apply Suggestions
                </button>
                <button
                  onClick={analyse}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg transition-colors"
                >
                  Re-analyse
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
