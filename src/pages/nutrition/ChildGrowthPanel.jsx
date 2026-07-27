import { useState, useEffect, useCallback } from 'react'
import { patientsApi, wellnessApi } from '@/api/client'
import { Modal, PageSpinner, Alert, EmptyState } from '@/components/ui'
import { Scale, Ruler, Plus, Sparkles, AlertTriangle } from 'lucide-react'
import LogGrowthRecordModal from './LogGrowthRecordModal'

export default function ChildGrowthPanel({ patient, onClose }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [logOpen, setLogOpen] = useState(false)

  const [guidance, setGuidance]           = useState(null)
  const [guidanceLoading, setGuidanceLoading] = useState(true)
  const [guidanceUnavailable, setGuidanceUnavailable] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await patientsApi.growthRecords.list(patient.id)
      setRecords(Array.isArray(data) ? data : data.results || [])
    } catch {
      setError('Failed to load growth records.')
    } finally { setLoading(false) }
  }, [patient.id])

  const loadGuidance = useCallback(async () => {
    setGuidanceLoading(true)
    try {
      const { data } = await wellnessApi.childNutrition(patient.id)
      setGuidance(data)
    } catch {
      // 404 with reason=no_age_on_file is expected until a DOB/age is recorded
      setGuidanceUnavailable(true)
    } finally { setGuidanceLoading(false) }
  }, [patient.id])

  useEffect(() => { load(); loadGuidance() }, [load, loadGuidance])

  return (
    <Modal open onClose={onClose} title={`${patient.patient_name} — Growth & Nutrition`} size="lg">
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
        {error && <Alert type="error" message={error}/>}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Age {patient.age} · {patient.household_name || 'No household'}</p>
          <button onClick={() => setLogOpen(true)} className="btn-primary text-xs">
            <Plus size={13}/> Log Entry
          </button>
        </div>

        {/* Age-banded feeding guidance, scoped to the household's food-security
            status. Falls back to a plain explanation (not a fake "coming soon")
            when there's genuinely no age on file yet — that's a data gap on
            this specific child, not a missing feature. */}
        {guidanceLoading ? (
          <div style={{ padding: '1rem 0' }}><PageSpinner/></div>
        ) : guidanceUnavailable ? (
          <div className="card px-4 py-3 bg-slate-50 border border-slate-200 flex items-start gap-2.5">
            <Sparkles size={16} className="text-slate-400 mt-0.5 shrink-0"/>
            <div>
              <p className="text-sm font-medium text-slate-600">Feeding guidance unavailable</p>
              <p className="text-xs text-slate-400 mt-0.5">
                No date of birth or age on file for this child yet — add one on the patient record to unlock age-appropriate guidance.
              </p>
            </div>
          </div>
        ) : guidance && (
          <>
            <div className="card px-4 py-3 bg-emerald-50 border border-emerald-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-emerald-600 shrink-0"/>
                <p className="text-sm font-semibold text-emerald-800">
                  Feeding guidance — {guidance.age_band}
                  {guidance.guidance_scope === 'resource_limited' && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium uppercase align-middle">
                      Resource-limited household
                    </span>
                  )}
                </p>
              </div>
              <ul className="space-y-1.5 pl-1">
                {guidance.feeding_tips.map((tip, i) => (
                  <li key={i} className="text-xs text-emerald-800 flex gap-1.5">
                    <span className="text-emerald-500">•</span>{tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card px-4 py-3 bg-red-50 border border-red-100">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0"/>
                <p className="text-sm font-semibold text-red-800">Seek care immediately if you see</p>
              </div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pl-1">
                {guidance.danger_signs.map((sign, i) => (
                  <li key={i} className="text-xs text-red-700 flex gap-1.5">
                    <span className="text-red-400">•</span>{sign}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Growth log</p>
        {loading ? <PageSpinner/> : records.length === 0 ? (
          <EmptyState icon={Scale} title="No growth records yet" description="Log a weight or MUAC entry from a home visit or facility check."/>
        ) : (
          <div className="space-y-2">
            {records.map(r => (
              <div key={r.id} className="card px-4 py-3 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{new Date(r.record_date).toLocaleDateString()}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{r.facility_name || 'No facility'} · {r.recorded_by_name || 'Unknown'}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-600">
                  {r.weight_kg && <span className="flex items-center gap-1"><Scale size={13}/> {r.weight_kg} kg</span>}
                  {r.muac_cm && <span className="flex items-center gap-1"><Ruler size={13}/> MUAC {r.muac_cm} cm</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LogGrowthRecordModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        patientId={patient.id}
        onSaved={() => { setLogOpen(false); load() }}
      />
    </Modal>
  )
}
