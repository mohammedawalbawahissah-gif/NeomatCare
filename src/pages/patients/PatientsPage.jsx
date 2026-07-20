import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { patientsApi } from '@/api/client'
import { PageSpinner, Alert, EmptyState, Spinner } from '@/components/ui'
import { UserCircle, Plus, Search, AlertTriangle, ShieldCheck, Clock, AlertOctagon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds, isQueueItemFailed } from '@/utils/offlineQueue'
import CreatePatientModal from './CreatePatientModal'

const RISK_COLORS = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-emerald-100 text-emerald-700',
}

export default function PatientsPage() {
  const navigate = useNavigate()
  const { isHealthWorker, isFacilityAdmin, isSuperAdmin } = useAuth()

  const [patients,  setPatients]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [search,    setSearch]    = useState('')
  const [risk,      setRisk]      = useState('')
  const [searching, setSearching] = useState(false)
  const [createOpen,setCreateOpen]= useState(false)
  const { pending, syncVersion } = useOfflineQueue()

  const canCreate = isHealthWorker || isFacilityAdmin || isSuperAdmin

  const queuedPatients = pending
    .filter(item => item.meta?.kind === QueueKinds.PATIENT_CREATE)
    .map(item => ({
      id: `queued:${item.id}`,
      __queued: true,
      __failed: isQueueItemFailed(item),
      __lastError: item.lastError,
      patient_name: item.data.patient_name,
      hospital_id: item.data.hospital_id,
      age: item.data.age,
      town: item.data.town,
      risk_level: null,
      consent_given: false,
      anc_visits: 0,
      case_count: 0,
      last_case_date: null,
    }))

  const load = async (q = '', riskLevel = '') => {
    setSearching(true)
    try {
      const params = {}
      if (q)         params.q = q
      if (riskLevel) params.risk_level = riskLevel
      const { data } = await patientsApi.list(params)
      setPatients(Array.isArray(data) ? data : data.results || [])
    } catch {
      setError('Failed to load patients.')
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }

  useEffect(() => { load() }, [])

  // A queued patient disappears from `pending` the instant it syncs —
  // refetch immediately so the real record replaces it without a gap.
  useEffect(() => { if (syncVersion > 0) load(search, risk) }, [syncVersion])

  const handleSearch = (e) => {
    e.preventDefault()
    load(search, risk)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">Patients</h1>
          <p className="text-xs text-slate-400 mt-0.5">Search and manage patient records</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={15}/> New Patient
          </button>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9"
            placeholder="Search by name, hospital ID, or phone…"
          />
        </div>
        <select
          value={risk}
          onChange={e => { setRisk(e.target.value); load(search, e.target.value) }}
          className="input-field w-36"
        >
          <option value="">All risk levels</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>
        <button type="submit" className="btn-secondary px-4" disabled={searching}>
          {searching ? <Spinner size={14}/> : 'Search'}
        </button>
      </form>

      {error && <Alert type="error" message={error}/>}

      {loading ? <PageSpinner/> : (patients.length === 0 && queuedPatients.length === 0) ? (
        <EmptyState
          icon={UserCircle}
          title="No patients found"
          description="Try a different search, or create a new patient record."
          action={canCreate && <button onClick={() => setCreateOpen(true)} className="btn-primary text-sm">New Patient</button>}
        />
      ) : (
        <div className="space-y-2">
          {queuedPatients.map(p => (
            <div
              key={p.id}
              className={`card px-5 py-4 flex items-center gap-4 border-dashed ${p.__failed ? 'border-danger-200 bg-danger-50/30' : 'border-amber-200 bg-amber-50/30'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.__failed ? 'bg-danger-100' : 'bg-amber-100'}`}>
                {p.__failed ? <AlertOctagon size={18} className="text-danger-600"/> : <Clock size={18} className="text-amber-600"/>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-800 text-sm truncate">{p.patient_name || 'Unnamed patient'}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${p.__failed ? 'bg-danger-100 text-danger-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.__failed ? 'Sync failed' : 'Pending sync'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ID: {p.hospital_id || '—'} · Age {p.age} · {p.town || 'Unknown town'} · not yet on server
                </p>
              </div>
            </div>
          ))}
          {patients.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/app/patients/${p.id}`)}
              className="card px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
                <UserCircle size={20} className="text-brand-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-800 text-sm truncate">{p.patient_name || '—'}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${RISK_COLORS[p.risk_level] || 'bg-slate-100 text-slate-500'}`}>
                    {p.risk_level} risk
                  </span>
                  {p.consent_given && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium flex items-center gap-1">
                      <ShieldCheck size={10}/> Consent
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ID: {p.hospital_id || '—'} · Age {p.age} · {p.town || 'Unknown town'} · {p.anc_visits} ANC visit{p.anc_visits !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-slate-700">{p.case_count} case{p.case_count !== 1 ? 's' : ''}</p>
                <p className="text-xs text-slate-400">{p.last_case_date ? new Date(p.last_case_date).toLocaleDateString() : 'No cases'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreatePatientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(p) => { setCreateOpen(false); navigate(`/app/patients/${p.id}`) }}
        onQueued={() => setCreateOpen(false)}
      />
    </div>
  )
}
