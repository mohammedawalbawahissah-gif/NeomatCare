import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { patientsApi, casesApi } from '@/api/client'
import { PageSpinner, Alert, Modal, Spinner, FormField, DangerSignList } from '@/components/ui'
import RiskNarratePanel from '@/components/ai/RiskNarratePanel'
import ANCAnomalyPanel from '@/components/ai/ANCAnomalyPanel'
import {
  ArrowLeft, UserCircle, Plus, Shield, ShieldOff, ShieldCheck,
  AlertTriangle, Calendar, Activity, ClipboardList, RefreshCw,
  Mail, Phone, Users, Edit2, CheckCircle, Stethoscope, Globe, Clock, AlertOctagon
} from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds, isQueueItemFailed } from '@/utils/offlineQueue'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import ReadAloudTrigger from '@/components/voice/ReadAloudBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'
import useReadAloud from '@/hooks/useReadAloud'

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

const RISK_COLORS = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const OUTCOME_COLORS = {
  survived: 'text-emerald-700',
  died:     'text-red-700',
  unknown:  'text-slate-400',
}

// ── ANC Visit Modal ───────────────────────────────────────────────────────────
function AddANCVisitModal({ open, onClose, patientId, onSaved }) {
  const [form, setForm] = useState({ visit_date: '', gestational_age_weeks: '', weight_kg: '', bp_systolic: '', bp_diastolic: '', fetal_heart_rate: '', fundal_height_cm: '', notes: '', concerns: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const { submitOrQueue } = useOfflineQueue()

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setVoiceField = k => (v) => setForm(f => ({ ...f, [k]: v }))
  const voiceFields = [
    { key: 'notes', label: 'Notes', get: () => form.notes, set: setVoiceField('notes') },
    { key: 'concerns', label: 'Concerns', get: () => form.concerns, set: setVoiceField('concerns') },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const handleSave = async () => {
    if (!form.visit_date) { setError('Visit date is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = { visit_date: form.visit_date }
      if (form.gestational_age_weeks) payload.gestational_age_weeks = Number(form.gestational_age_weeks)
      if (form.weight_kg)    payload.weight_kg    = Number(form.weight_kg)
      if (form.bp_systolic)  payload.bp_systolic  = Number(form.bp_systolic)
      if (form.bp_diastolic) payload.bp_diastolic = Number(form.bp_diastolic)
      if (form.fetal_heart_rate) payload.fetal_heart_rate = Number(form.fetal_heart_rate)
      if (form.fundal_height_cm) payload.fundal_height_cm = Number(form.fundal_height_cm)
      if (form.notes)    payload.notes    = form.notes
      if (form.concerns) payload.concerns = form.concerns
      await submitOrQueue({
        method: 'post',
        url: `/api/cases/patients/${patientId}/anc-visits/`,
        data: payload,
        meta: { kind: QueueKinds.ANC_VISIT_CREATE, label: `ANC visit — ${form.visit_date}`, patientId },
      })
      onSaved()
      setForm({ visit_date:'',gestational_age_weeks:'',weight_kg:'',bp_systolic:'',bp_diastolic:'',fetal_heart_rate:'',fundal_height_cm:'',notes:'',concerns:'' })
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to save visit.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log ANC Visit">
      <div className="space-y-4">
        {error && <Alert type="error" message={error}/>}
        <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Visit Date <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={form.visit_date} onChange={set('visit_date')}/>
          </div>
          <div><label className={labelCls}>Gestational Age (wks)</label><input type="number" className={inputCls} value={form.gestational_age_weeks} onChange={set('gestational_age_weeks')} min={0} max={45}/></div>
          <div><label className={labelCls}>Weight (kg)</label><input type="number" className={inputCls} value={form.weight_kg} onChange={set('weight_kg')} step="0.1"/></div>
          <div><label className={labelCls}>BP Systolic</label><input type="number" className={inputCls} value={form.bp_systolic} onChange={set('bp_systolic')}/></div>
          <div><label className={labelCls}>BP Diastolic</label><input type="number" className={inputCls} value={form.bp_diastolic} onChange={set('bp_diastolic')}/></div>
          <div><label className={labelCls}>Fetal HR (bpm)</label><input type="number" className={inputCls} value={form.fetal_heart_rate} onChange={set('fetal_heart_rate')}/></div>
          <div><label className={labelCls}>Fundal Height (cm)</label><input type="number" className={inputCls} value={form.fundal_height_cm} onChange={set('fundal_height_cm')} step="0.1"/></div>
          <div className="col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea rows={2} className={inputCls+' resize-none w-full'} value={form.notes} onChange={set('notes')}/>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Concerns</label>
            <textarea rows={2} className={inputCls+' resize-none w-full'} value={form.concerns} onChange={set('concerns')} placeholder="Any clinical concerns noted…"/>
          </div>
        </div>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={14} className="text-white"/> : <><Stethoscope size={14}/> Log Visit</>}
          </button>
        </div>
      </div>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}

// ── Consent Modal ─────────────────────────────────────────────────────────────
function ConsentModal({ open, onClose, patientId, onSaved }) {
  const [form, setForm] = useState({ consent_type: 'data_use', action: 'granted', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const voiceFields = [{ key: 'notes', label: 'Notes', get: () => form.notes, set: (v) => setForm(f => ({ ...f, notes: v })) }]
  const voiceEntry = useVoiceEntry(voiceFields)

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const { data } = await patientsApi.consent.record(patientId, form)
      onSaved(data)
    } catch (err) {
      setError('Failed to record consent.')
    } finally { setSaving(false) }
  }

  const CONSENT_TYPES = [
    { value: 'data_use',  label: 'Data Use & Storage' },
    { value: 'portal',    label: 'Patient Portal Access' },
    { value: 'sharing',   label: 'Facility Data Sharing' },
    { value: 'research',  label: 'Anonymised Research Use' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Record Consent">
      <div className="space-y-4">
        {error && <Alert type="error" message={error}/>}
        <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
        <FormField label="Consent Type" required>
          <select className="input-field" value={form.consent_type} onChange={e => setForm(f=>({...f,consent_type:e.target.value}))}>
            {CONSENT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </FormField>
        <FormField label="Action" required>
          <select className="input-field" value={form.action} onChange={e => setForm(f=>({...f,action:e.target.value}))}>
            <option value="granted">Granted</option>
            <option value="revoked">Revoked</option>
            <option value="updated">Updated</option>
          </select>
        </FormField>
        <FormField label="Notes">
          <textarea rows={2} className="input-field resize-none" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Additional context…"/>
        </FormField>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={14} className="text-white"/> : <><ShieldCheck size={14}/> Record Consent</>}
          </button>
        </div>
      </div>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}

// ── Portal Modal ──────────────────────────────────────────────────────────────
function PortalModal({ open, onClose, patientId, hasPortal, onSaved }) {
  const [form, setForm]   = useState({ email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const handleGrant = async () => {
    if (!form.email || !form.password) { setError('Email and password are required.'); return }
    setSaving(true); setError('')
    try {
      const { data } = await patientsApi.portal.grant(patientId, form)
      onSaved(data)
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'string' ? d : d?.detail || 'Failed to create portal account.')
    } finally { setSaving(false) }
  }

  const handleRevoke = async () => {
    setSaving(true); setError('')
    try {
      await patientsApi.portal.revoke(patientId)
      onSaved(null)
    } catch { setError('Failed to revoke portal access.') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={hasPortal ? 'Revoke Portal Access' : 'Grant Portal Access'}>
      <div className="space-y-4">
        {error && <Alert type="error" message={error}/>}
        {hasPortal ? (
          <>
            <p className="text-sm text-slate-600">This patient currently has a portal account. Revoking will deactivate their login access — their health records will be preserved.</p>
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleRevoke} disabled={saving} className="btn-primary flex-1 justify-center bg-red-600 hover:bg-red-700 border-red-600">
                {saving ? <Spinner size={14} className="text-white"/> : <><ShieldOff size={14}/> Revoke Access</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">Create a portal login for this patient. They will be able to view their profile and referral status.</p>
            <FormField label="Patient Email" required>
              <input type="email" className="input-field" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="patient@email.com"/>
            </FormField>
            <FormField label="Temporary Password" required hint="Patient should change this on first login">
              <input type="password" className="input-field" value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} placeholder="Min. 8 characters"/>
            </FormField>
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleGrant} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? <Spinner size={14} className="text-white"/> : <><Globe size={14}/> Create Portal Account</>}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PatientDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { isHealthWorker, isFacilityAdmin, isSuperAdmin } = useAuth()

  const [patient,     setPatient]     = useState(null)
  const [cases,       setCases]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [tab,         setTab]         = useState('overview')
  const [ancModal,    setAncModal]    = useState(false)
  const [consentModal,setConsentModal]= useState(false)
  const [portalModal, setPortalModal] = useState(false)
  const [computing,   setComputing]   = useState(false)
  const { pending, syncVersion } = useOfflineQueue()

  const canManage = isHealthWorker || isFacilityAdmin || isSuperAdmin

  const queuedAncVisits = pending
    .filter(item => item.meta?.kind === QueueKinds.ANC_VISIT_CREATE && item.meta?.patientId === id)
    .map(item => ({
      id: `queued:${item.id}`,
      __queued: true,
      __failed: isQueueItemFailed(item),
      visit_date: item.data.visit_date,
      gestational_age_weeks: item.data.gestational_age_weeks,
      bp_systolic: item.data.bp_systolic,
      bp_diastolic: item.data.bp_diastolic,
      fetal_heart_rate: item.data.fetal_heart_rate,
      weight_kg: item.data.weight_kg,
      concerns: item.data.concerns,
      notes: item.data.notes,
      facility_name: null,
      conducted_by_name: null,
    }))

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        patientsApi.detail(id),
        patientsApi.cases(id),
      ])
      setPatient(pRes.data)
      setCases(Array.isArray(cRes.data) ? cRes.data : cRes.data.results || [])
    } catch {
      setError('Patient not found.')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (syncVersion > 0) load() }, [syncVersion])

  const handleComputeRisk = async () => {
    setComputing(true)
    try {
      await patientsApi.computeRisk(id)
      const { data } = await patientsApi.detail(id)
      setPatient(data)
    } catch {}
    finally { setComputing(false) }
  }

  // Hooks must run unconditionally on every render, so this is computed
  // before the loading/error early-returns below, using a safe fallback.
  const pSafe = patient || {}
  const overviewReadAloudItems = [
    { label: 'Patient', text: `${pSafe.patient_name || 'Unnamed patient'}, ${pSafe.age} years, ${pSafe.town || 'location unknown'}` },
    { label: 'Blood group', text: pSafe.blood_group || 'not recorded' },
    { label: 'Obstetric summary', text: `Gravida ${pSafe.gravida ?? 'unknown'}, parity ${pSafe.parity ?? 'unknown'}, ${pSafe.anc_visits || 0} ANC visits` },
    ...((pSafe.next_of_kin_name || pSafe.next_of_kin_phone) ? [{ label: 'Next of kin', text: `${pSafe.next_of_kin_name || 'unnamed'}, ${pSafe.next_of_kin_relationship || ''}, ${pSafe.next_of_kin_phone || 'no phone on file'}` }] : []),
    ...(pSafe.notes ? [{ label: 'Background notes', text: pSafe.notes }] : []),
  ]
  const overviewReadAloud = useReadAloud(overviewReadAloudItems)
  const [riskSpeakable, setRiskSpeakable] = useState(null)
  const riskReadAloud = useReadAloud(riskSpeakable ? [{ label: 'AI risk explanation', text: riskSpeakable }] : [])
  const [ancSpeakable, setAncSpeakable] = useState(null)
  const ancReadAloud = useReadAloud(ancSpeakable ? [{ label: 'AI ANC pattern analysis', text: ancSpeakable }] : [])

  if (loading) return <PageSpinner/>
  if (error)   return <div className="p-6"><Alert type="error" message={error}/></div>

  const p = patient
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'anc',      label: `ANC Visits (${(p.anc_visit_log?.length || 0) + queuedAncVisits.length})` },
    { id: 'cases',    label: `Cases (${cases.length})` },
    { id: 'consent',  label: 'Consent & Privacy' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 mt-0.5"><ArrowLeft size={18}/></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="section-title">{p.patient_name || 'Unnamed Patient'}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${RISK_COLORS[p.risk_level]}`}>
              {p.risk_level?.toUpperCase()} RISK
            </span>
            {p.has_portal_access && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 font-medium flex items-center gap-1">
                <Globe size={11}/> Portal active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {p.hospital_id || '—'}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={handleComputeRisk} disabled={computing} className="btn-secondary text-xs px-3 py-2">
              {computing ? <Spinner size={13}/> : <><RefreshCw size={13}/> Recompute Risk</>}
            </button>
            <button onClick={() => setPortalModal(true)} className="btn-secondary text-xs px-3 py-2">
              {p.has_portal_access ? <><ShieldOff size={13}/> Revoke Portal</> : <><Globe size={13}/> Grant Portal</>}
            </button>
          </div>
        )}
      </div>

      {/* Risk flags */}
      {p.risk_flags?.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {p.risk_flags.map((flag, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-amber-50 border border-amber-100 text-amber-700 rounded-lg">
              <AlertTriangle size={11}/> {flag}
            </span>
          ))}
        </div>
      )}

      {/* AI Risk Narration */}
      {p.risk_level && p.risk_flags?.length > 0 && (
        <>
          <ReadAloudTrigger readAloud={riskReadAloud} />
          <RiskNarratePanel
            patientId={p.id}
            riskLevel={p.risk_level}
            riskFlags={p.risk_flags}
            onSpeakableText={setRiskSpeakable}
          />
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-100 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id ? 'bg-white border border-b-white border-slate-100 text-brand-600 -mb-px' : 'text-slate-500 hover:text-slate-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="lg:col-span-2"><ReadAloudTrigger readAloud={overviewReadAloud} /></div>
          <div className="card px-5 py-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Demographics</p>
            {[
              ['Age', `${p.age} years`],
              ['Date of Birth', p.date_of_birth ? format(new Date(p.date_of_birth), 'dd MMM yyyy') : '—'],
              ['Town', p.town || '—'],
              ['Blood Group', p.blood_group || '—'],
              ['Phone', p.patient_phone_number || '—'],
              ['Registered at', p.registered_at_facility_name || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center border-b border-slate-50 py-1.5 last:border-0">
                <span className="text-xs text-slate-500">{k}</span>
                <span className="text-sm font-medium text-slate-800">{v}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="card px-5 py-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Obstetric Summary</p>
              {[
                ['Gravida', p.gravida ?? '—'],
                ['Parity', p.parity ?? '—'],
                ['Expected Delivery', p.expected_delivery_date ? format(new Date(p.expected_delivery_date), 'dd MMM yyyy') : '—'],
                ['ANC Visits', p.anc_visits],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center border-b border-slate-50 py-1.5 last:border-0">
                  <span className="text-xs text-slate-500">{k}</span>
                  <span className="text-sm font-medium text-slate-800">{v}</span>
                </div>
              ))}
            </div>

            {(p.next_of_kin_name || p.next_of_kin_phone) && (
              <div className="card px-5 py-4 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next of Kin</p>
                <p className="text-sm font-medium text-slate-800">{p.next_of_kin_name}</p>
                <p className="text-xs text-slate-500">{p.next_of_kin_relationship} · {p.next_of_kin_phone}</p>
              </div>
            )}

            {p.notes && (
              <div className="card px-5 py-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Background Notes</p>
                <p className="text-sm text-slate-700 leading-relaxed">{p.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ANC Tab ── */}
      {tab === 'anc' && (
        <div className="space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={() => setAncModal(true)} className="btn-primary text-sm">
                <Plus size={14}/> Log ANC Visit
              </button>
            </div>
          )}
          {/* AI ANC Anomaly Detection */}
          <ReadAloudTrigger readAloud={ancReadAloud} />
          <ANCAnomalyPanel
            patientId={p.id}
            visitCount={p.anc_visit_log?.length || 0}
            onSpeakableText={setAncSpeakable}
          />
          {!p.anc_visit_log?.length && !queuedAncVisits.length ? (
            <div className="card px-5 py-8 text-center">
              <Stethoscope size={28} className="text-slate-300 mx-auto mb-2"/>
              <p className="text-sm text-slate-400">No ANC visits recorded yet.</p>
            </div>
          ) : (
            [...queuedAncVisits, ...(p.anc_visit_log || [])].map(v => (
              <div key={v.id} className={`card px-5 py-4 ${v.__queued ? (v.__failed ? 'border-dashed border-danger-200 bg-danger-50/30' : 'border-dashed border-amber-200 bg-amber-50/30') : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {format(new Date(v.visit_date), 'dd MMM yyyy')}
                      {v.gestational_age_weeks && <span className="text-slate-400 font-normal"> · {v.gestational_age_weeks} weeks</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{v.facility_name || 'No facility'} · {v.conducted_by_name || 'Unknown'}</p>
                  </div>
                  {v.__queued ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase flex items-center gap-1 h-fit shrink-0 ${v.__failed ? 'bg-danger-100 text-danger-700' : 'bg-amber-100 text-amber-700'}`}>
                      {v.__failed ? <AlertOctagon size={10}/> : <Clock size={10}/>} {v.__failed ? 'Sync failed' : 'Pending sync'}
                    </span>
                  ) : (
                    <div className="flex gap-4 text-right text-xs text-slate-500">
                      {v.bp_systolic && <span>BP {v.bp_systolic}/{v.bp_diastolic}</span>}
                      {v.weight_kg   && <span>{v.weight_kg} kg</span>}
                      {v.fetal_heart_rate && <span>FHR {v.fetal_heart_rate}</span>}
                    </div>
                  )}
                </div>
                {v.concerns && <p className="mt-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">{v.concerns}</p>}
                {v.notes    && <p className="mt-1 text-xs text-slate-500">{v.notes}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Cases Tab ── */}
      {tab === 'cases' && (
        <div className="space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <Link to={`/app/cases/new?patient=${id}`} className="btn-primary text-sm">
                <Plus size={14}/> New Emergency Case
              </Link>
            </div>
          )}
          {!cases.length ? (
            <div className="card px-5 py-8 text-center">
              <ClipboardList size={28} className="text-slate-300 mx-auto mb-2"/>
              <p className="text-sm text-slate-400">No emergency cases recorded for this patient.</p>
            </div>
          ) : (
            cases.map(c => (
              <Link
                key={c.id}
                to={`/app/cases/${c.id}`}
                className="card px-5 py-4 block hover:border-brand-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.presenting_complaint || 'No complaint recorded'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {c.referring_facility_name} · {format(new Date(c.created_at), 'dd MMM yyyy, HH:mm')}
                    </p>
                    {c.danger_signs?.length > 0 && (
                      <div className="mt-2"><DangerSignList signs={c.danger_signs}/></div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {c.maternal_outcome !== 'unknown' && (
                      <span className={`text-xs font-medium ${OUTCOME_COLORS[c.maternal_outcome]}`}>
                        Maternal: {c.maternal_outcome}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* ── Consent Tab ── */}
      {tab === 'consent' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className={`card px-5 py-4 border-2 ${p.consent_given ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                {p.consent_given
                  ? <ShieldCheck size={20} className="text-emerald-600"/>
                  : <Shield size={20} className="text-slate-400"/>
                }
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.consent_given ? 'Consent given' : 'No consent recorded'}</p>
                  {p.consent_given_at && (
                    <p className="text-xs text-slate-500">On {format(new Date(p.consent_given_at), 'dd MMM yyyy')}</p>
                  )}
                </div>
              </div>
            </div>
            <div className={`card px-5 py-4 border-2 ${p.has_portal_access ? 'border-sky-200 bg-sky-50' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <Globe size={20} className={p.has_portal_access ? 'text-sky-600' : 'text-slate-400'}/>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.has_portal_access ? 'Portal access active' : 'No portal account'}</p>
                  <p className="text-xs text-slate-500">{p.has_portal_access ? 'Patient can log in' : 'Disabled'}</p>
                </div>
              </div>
            </div>
          </div>

          {canManage && (
            <button onClick={() => setConsentModal(true)} className="btn-secondary text-sm">
              <ShieldCheck size={14}/> Record Consent
            </button>
          )}

          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">Consent History</p>
            </div>
            {!p.consents?.length ? (
              <div className="px-5 py-6 text-center text-sm text-slate-400">No consent records yet.</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {p.consents.map(c => (
                  <div key={c.id} className="px-5 py-3 flex items-start gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${c.action === 'granted' ? 'bg-emerald-100 text-emerald-700' : c.action === 'revoked' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                      {c.action}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-slate-700">{c.consent_type?.replace(/_/g, ' ')}</p>
                      {c.notes && <p className="text-xs text-slate-400 mt-0.5">{c.notes}</p>}
                    </div>
                    <p className="text-xs text-slate-400 shrink-0">
                      {c.recorded_by_name} · {format(new Date(c.timestamp), 'dd MMM yyyy')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AddANCVisitModal
        open={ancModal}
        onClose={() => setAncModal(false)}
        patientId={id}
        onSaved={() => { setAncModal(false); load() }}
      />
      <ConsentModal
        open={consentModal}
        onClose={() => setConsentModal(false)}
        patientId={id}
        onSaved={() => { setConsentModal(false); load() }}
      />
      <PortalModal
        open={portalModal}
        onClose={() => setPortalModal(false)}
        patientId={id}
        hasPortal={p.has_portal_access}
        onSaved={() => { setPortalModal(false); load() }}
      />
    </div>
  )
}
