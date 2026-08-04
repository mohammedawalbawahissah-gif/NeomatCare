/**
 * src/components/ai/HandoverBriefPanel.jsx
 *
 * Generates and displays an AI clinical handover brief for a referral or case.
 * Mounts inside ReferralDetailPage and CaseDetailPage.
 *
 * Props:
 *   referralId  {string}  - Referral UUID (preferred)
 *   caseId      {string}  - Emergency case UUID (fallback)
 *   compact     {boolean} - If true, show compact card version
 */

import { useState, useEffect } from 'react'
import { aiApi } from '@/api/ai'
import { Sparkles, Loader2, AlertCircle, FileText, Copy, Check, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

export default function HandoverBriefPanel({ referralId, caseId, compact = false, onSpeakableText }) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [copied,  setCopied]  = useState(false)

  const generate = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const params = referralId ? { referral_id: referralId } : { case_id: caseId }
      const { data } = await aiApi.referralHandover(params)
      setResult(data.data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Handover brief generation failed.')
    } finally {
      setLoading(false)
    }
  }

  const copyBrief = async () => {
    if (!result?.brief) return
    try {
      await navigator.clipboard.writeText(result.brief)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const speakableText = result && [
    result.brief,
    result.immediate_actions?.length ? `Immediate actions: ${result.immediate_actions.join('. ')}.` : '',
  ].filter(Boolean).join(' ')

  useEffect(() => { onSpeakableText?.(speakableText || null) }, [speakableText])

  if (compact && !result) {
    return (
      <button
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {loading
          ? <Loader2 size={12} className="animate-spin" />
          : <Sparkles size={12} />
        }
        {loading ? 'Generating…' : 'Generate Handover Brief'}
      </button>
    )
  }

  return (
    <div className="border border-purple-200 rounded-xl bg-purple-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-purple-700">
        <FileText size={15} className="text-purple-200" />
        <span className="text-white text-sm font-semibold flex-1">AI Clinical Handover Brief</span>
        {result && (
          <button
            onClick={generate}
            title="Regenerate"
            className="p-1 rounded text-purple-300 hover:text-white transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        {!result && !loading && (
          <div>
            <p className="text-xs text-purple-900 mb-3">
              Generate a clinical handover brief for the receiving specialist or facility —
              patient background, current presentation, danger signs, and immediate needs.
            </p>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Sparkles size={14} />
              Generate Handover Brief
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-purple-700 py-1">
            <Loader2 size={15} className="animate-spin" />
            <span className="text-xs">Drafting clinical handover…</span>
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
            {/* Brief text */}
            <div className="relative">
              <div className="bg-white rounded-xl border border-purple-100 px-4 py-3">
                <p className="text-sm text-slate-800 leading-relaxed">{result.brief}</p>
              </div>
              <button
                onClick={copyBrief}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>

            {/* Immediate actions */}
            {result.immediate_actions?.length > 0 && (
              <div>
                <p className="text-[11px] font-600 text-slate-500 uppercase tracking-wider mb-1.5">
                  Immediate Actions Required
                </p>
                <ul className="space-y-1">
                  {result.immediate_actions.map((act, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-800">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[9px] font-bold mt-0.5">
                        {i + 1}
                      </span>
                      {act}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Resource flags */}
            <div className="flex gap-2 flex-wrap">
              {result.blood_products_likely && (
                <span className="text-[11px] px-2.5 py-1 bg-red-100 text-red-700 rounded-full font-medium border border-red-200">
                  🩸 Blood Products Likely
                </span>
              )}
              {result.theatre_likely && (
                <span className="text-[11px] px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full font-medium border border-orange-200">
                  🔪 Theatre Likely
                </span>
              )}
              {result.icu_likely && (
                <span className="text-[11px] px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full font-medium border border-purple-200">
                  🏥 ICU Likely
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
