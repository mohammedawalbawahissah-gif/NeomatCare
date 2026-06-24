/**
 * src/components/ai/TransportRecommendPanel.jsx
 *
 * AI transport recommendation panel for CaseDetailPage / TransportPage.
 *
 * Props:
 *   caseId                 {string}  - Emergency case UUID
 *   availableVehicles      {Array}   - Vehicles from transportApi.vehicles.available()
 *   estimatedTravelMinutes {number}  - Estimated travel to receiving facility
 *   onSelect               {function} - Callback(vehicleId) when user confirms recommendation
 */

import { useState } from 'react'
import { aiApi } from '@/api/ai'
import { Sparkles, Truck, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import clsx from 'clsx'

const URGENCY_CONFIG = {
  immediate: { color: 'bg-red-100 text-red-700 border-red-200',     label: 'IMMEDIATE' },
  urgent:    { color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'URGENT' },
  routine:   { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'ROUTINE' },
}

export default function TransportRecommendPanel({
  caseId,
  availableVehicles = [],
  estimatedTravelMinutes = 30,
  onSelect,
}) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const recommend = async () => {
    if (!availableVehicles.length) {
      setError('No vehicles available to analyse.')
      return
    }
    setLoading(true); setError(''); setResult(null)

    // Prepare vehicle payload
    const vehicles = availableVehicles.map(v => ({
      id: v.id,
      type: v.vehicle_type || v.type || 'unknown',
      status: v.status,
      distance_km: v.distance_km || null,
      driver_name: v.driver?.name || v.driver_name || 'Unassigned',
    }))

    try {
      const { data } = await aiApi.transportRecommend(caseId, estimatedTravelMinutes, vehicles)
      setResult(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Recommendation failed.')
    } finally {
      setLoading(false)
    }
  }

  const recommended = result?.data?.recommended_vehicle_id
    ? availableVehicles.find(v => v.id === result.data.recommended_vehicle_id)
    : null

  const urgencyCfg = URGENCY_CONFIG[result?.data?.urgency_classification] || URGENCY_CONFIG.routine

  return (
    <div className="border border-amber-200 rounded-xl bg-amber-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-600">
        <Truck size={15} className="text-amber-100" />
        <span className="text-white text-sm font-semibold flex-1">AI Transport Recommendation</span>
        <span className="text-amber-200 text-[11px]">{availableVehicles.length} vehicles available</span>
      </div>

      <div className="px-4 py-3">
        {!result && !loading && (
          <div>
            <p className="text-xs text-amber-900 mb-3">
              AI will analyse case urgency and available vehicles to recommend the optimal dispatch.
            </p>
            <button
              onClick={recommend}
              disabled={!availableVehicles.length}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles size={14} />
              Recommend Vehicle
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-amber-700 py-1">
            <Loader2 size={15} className="animate-spin" />
            <span className="text-xs">Analysing dispatch options…</span>
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
            {/* Urgency classification */}
            <div className="flex items-center gap-2">
              <span className={clsx('text-xs px-2.5 py-1 rounded-full border font-semibold', urgencyCfg.color)}>
                {urgencyCfg.label}
              </span>
              {result.data?.estimated_dispatch_time_minutes && (
                <span className="flex items-center gap-1 text-xs text-slate-600">
                  <Clock size={11} />
                  ~{result.data.estimated_dispatch_time_minutes} min estimated dispatch
                </span>
              )}
            </div>

            {/* Recommended vehicle */}
            {result.data?.recommended_vehicle_id ? (
              <div className="bg-white rounded-xl border border-amber-100 px-4 py-3">
                <p className="text-[11px] font-600 text-slate-500 uppercase tracking-wider mb-2">
                  Recommended Vehicle
                </p>
                {recommended ? (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Truck size={18} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {recommended.registration_number || recommended.name || result.data.recommended_vehicle_id}
                      </p>
                      <p className="text-xs text-slate-500">
                        {recommended.vehicle_type || 'Vehicle'} • Driver: {recommended.driver?.name || 'Unassigned'}
                      </p>
                    </div>
                    <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                  </div>
                ) : (
                  <p className="text-sm text-slate-700">Vehicle ID: {result.data.recommended_vehicle_id}</p>
                )}

                {/* Reasoning */}
                <p className="text-xs text-slate-600 mt-2 italic">{result.data.reasoning}</p>

                {/* Confirm button */}
                {onSelect && (
                  <button
                    onClick={() => onSelect(result.data.recommended_vehicle_id)}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors w-full justify-center"
                  >
                    <CheckCircle size={14} />
                    Confirm This Vehicle
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100">
                <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                No suitable vehicle found. {result.data?.reasoning}
              </div>
            )}

            {/* Alternatives */}
            {result.data?.alternatives?.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Alternatives: {result.data.alternatives.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
