import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { householdsApi, patientsApi } from '@/api/client'
import { PageSpinner, Alert, Modal, EmptyState, StatCard } from '@/components/ui'
import { ArrowLeft, Home, Users, UserCircle, Wheat, Edit2, Baby } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

const RISK_COLORS = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const FOOD_SECURITY_OPTIONS = [
  { value: 'unknown',  label: 'Unknown' },
  { value: 'secure',   label: 'Secure' },
  { value: 'at_risk',  label: 'At risk' },
  { value: 'insecure', label: 'Insecure' },
]

// ── Attach existing patient modal ──────────────────────────────────────────
function AttachPatientModal({ open, onClose, householdId, onAttached }) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const search = async (q) => {
    if (!q) { setResults([]); return }
    try {
      const { data } = await patientsApi.list({ q })
      setResults(Array.isArray(data) ? data : data.results || [])
    } catch { /* silent — results just stay empty */ }
  }

  const attach = async (patient) => {
    setSaving(true); setError('')
    try {
      await patientsApi.update(patient.id, { household: householdId })
      onAttached()
    } catch {
      setError('Failed to attach patient to this household.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Existing Patient to Household" size="md">
      <div className="space-y-3">
        {error && <Alert type="error" message={error}/>}
        <input
          className={inputCls}
          placeholder="Search by name, hospital ID, or phone…"
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value) }}
        />
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {results.map(p => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 hover:border-brand-200">
              <div>
                <p className="text-sm font-medium text-slate-800">{p.patient_name}</p>
                <p className="text-xs text-slate-400">{p.hospital_id || '—'} · Age {p.age}</p>
              </div>
              <button className="btn-secondary text-xs" disabled={saving} onClick={() => attach(p)}>
                Add
              </button>
            </div>
          ))}
          {query && results.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No matching patients.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Edit food security modal ───────────────────────────────────────────────
function EditFoodSecurityModal({ open, onClose, household, onSaved }) {
  const [value, setValue] = useState(household?.food_security_flag || 'unknown')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await householdsApi.update(household.id, { food_security_flag: value })
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Update Food Security Status" size="sm">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Food security status</label>
          <select className={inputCls} value={value} onChange={e => setValue(e.target.value)}>
            {FOOD_SECURITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">Scopes nutrition guidance for this household's children.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  )
}

export default function HouseholdDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isHealthWorker, isFacilityAdmin, isSuperAdmin } = useAuth()
  const canEdit = isHealthWorker || isFacilityAdmin || isSuperAdmin

  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [editFoodOpen, setEditFoodOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await householdsApi.detail(id)
      setHousehold(data)
    } catch {
      setError('Failed to load household.')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <PageSpinner/>
  if (error || !household) return <div className="p-6"><Alert type="error" message={error || 'Household not found.'}/></div>

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 animate-fade-in">
      <button onClick={() => navigate('/app/households')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15}/> Back to Households
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
            <Home size={22} className="text-brand-600"/>
          </div>
          <div>
            <h1 className="section-title">{household.head_name || 'Unnamed household'}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{household.town || 'Unknown town'} · {household.facility_name || 'No facility'}</p>
          </div>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold uppercase border ${RISK_COLORS[household.aggregate_risk_level] || 'bg-slate-100 text-slate-500'}`}>
          {household.aggregate_risk_level} risk
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Members" value={household.members.length} icon={Users}/>
        <div className="card px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Food security</p>
            <p className="text-sm font-semibold text-slate-800 capitalize">{household.food_security_flag.replace('_', ' ')}</p>
          </div>
          {canEdit && (
            <button onClick={() => setEditFoodOpen(true)} className="text-slate-400 hover:text-brand-600">
              <Edit2 size={15}/>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Members</h2>
        {canEdit && (
          <button onClick={() => setAttachOpen(true)} className="btn-secondary text-xs">
            + Add Existing Patient
          </button>
        )}
      </div>

      {household.members.length === 0 ? (
        <EmptyState icon={Users} title="No members yet" description="Attach existing patients or register a new one and set their household."/>
      ) : (
        <div className="space-y-2">
          {household.members.map(m => (
            <Link
              key={m.id}
              to={`/app/patients/${m.id}`}
              className="card px-4 py-3 flex items-center gap-3 hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center shrink-0">
                {m.patient_type === 'child' ? <Baby size={16} className="text-brand-600"/> : <UserCircle size={16} className="text-brand-600"/>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{m.patient_name}</p>
                <p className="text-xs text-slate-400 capitalize">{m.patient_type} · Age {m.age}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${RISK_COLORS[m.risk_level] || 'bg-slate-100 text-slate-500'}`}>
                {m.risk_level} risk
              </span>
            </Link>
          ))}
        </div>
      )}

      <AttachPatientModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        householdId={household.id}
        onAttached={() => { setAttachOpen(false); load() }}
      />
      <EditFoodSecurityModal
        open={editFoodOpen}
        onClose={() => setEditFoodOpen(false)}
        household={household}
        onSaved={() => { setEditFoodOpen(false); load() }}
      />
    </div>
  )
}
