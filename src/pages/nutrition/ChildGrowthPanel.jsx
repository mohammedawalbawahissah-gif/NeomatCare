import { useState, useEffect, useCallback } from 'react'
import { patientsApi } from '@/api/client'
import { Modal, PageSpinner, Alert, EmptyState } from '@/components/ui'
import { Scale, Ruler, Plus, Sparkles } from 'lucide-react'
import LogGrowthRecordModal from './LogGrowthRecordModal'

export default function ChildGrowthPanel({ patient, onClose }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [logOpen, setLogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await patientsApi.growthRecords.list(patient.id)
      setRecords(Array.isArray(data) ? data : data.results || [])
    } catch {
      setError('Failed to load growth records.')
    } finally { setLoading(false) }
  }, [patient.id])

  useEffect(() => { load() }, [load])

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

        {/* Guidance — content engine keyed off age-in-months + household food
            security is the next backend phase; shown here as a clear
            placeholder rather than silently omitted, so it's obvious this is
            in progress and not a bug. */}
        <div className="card px-4 py-3 bg-amber-50 border border-amber-100 flex items-start gap-2.5">
          <Sparkles size={16} className="text-amber-600 mt-0.5 shrink-0"/>
          <div>
            <p className="text-sm font-medium text-amber-800">Age-appropriate feeding guidance</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Coming soon — guidance content scoped to this child's age band and household food security status is still being built.
            </p>
          </div>
        </div>

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
