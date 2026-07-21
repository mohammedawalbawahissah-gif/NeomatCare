import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { casesApi, referralsApi, transportApi, consultationsApi, facilitiesApi } from '@/api/client'
import { PageSpinner, Alert, DangerSignList, Modal, Spinner, FormField } from '@/components/ui'
import TriageAIPanel from '@/components/ai/TriageAIPanel'
import HandoverBriefPanel from '@/components/ai/HandoverBriefPanel'
import TransportRecommendPanel from '@/components/ai/TransportRecommendPanel'
import { ArrowLeft, Plus, ArrowRightLeft, Truck, Video, MapPin, Activity, Pencil, CheckCircle, RefreshCw, ChevronRight, Clock, AlertOctagon } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds, isQueueItemFailed, MAX_RETRIES } from '@/utils/offlineQueue'
import { cachedFetch } from '@/utils/cachedFetch'
import SpeakButton from '@/components/voice/SpeakButton'

const ALL_DANGER_SIGNS = [
  'PPH','APH','RUPTURED_UTERUS','ECLAMPSIA','SEVERE_PRE_ECLAMPSIA',
  'OBSTRUCTED_LABOUR','CORD_PROLAPSE','PUERPERAL_SEPSIS','CHORIOAMNIONITIS',
  'NEONATAL_DISTRESS','PRETERM_LABOUR','NEONATAL_SEPSIS','SEVERE_ANAEMIA','MALPRESENTATION',
]
const DANGER_LABELS = {
  PPH:'PPH', APH:'APH', RUPTURED_UTERUS:'Ruptured Uterus', ECLAMPSIA:'Eclampsia',
  SEVERE_PRE_ECLAMPSIA:'Severe Pre-Eclampsia', OBSTRUCTED_LABOUR:'Obstructed Labour',
  CORD_PROLAPSE:'Cord Prolapse', PUERPERAL_SEPSIS:'Puerperal Sepsis',
  CHORIOAMNIONITIS:'Chorioamnionitis', NEONATAL_DISTRESS:'Neonatal Distress',
  PRETERM_LABOUR:'Preterm Labour', NEONATAL_SEPSIS:'Neonatal Sepsis',
  SEVERE_ANAEMIA:'Severe Anaemia', MALPRESENTATION:'Malpresentation',
}

// Referral state machine transitions (mirrors backend VALID_TRANSITIONS)
const VALID_TRANSITIONS = {
  DRAFT:      ['PENDING','CANCELLED'],
  PENDING:    ['ACCEPTED','CANCELLED'],
  ACCEPTED:   ['IN_TRANSIT','CANCELLED'],
  IN_TRANSIT: ['RECEIVED','FAILED'],
  RECEIVED:   ['COMPLETED'],
  COMPLETED:[], CANCELLED:[], FAILED:[],
}

const STATUS_COLORS = {
  DRAFT:'bg-slate-100 text-slate-600',      PENDING:'bg-amber-100 text-amber-700',
  ACCEPTED:'bg-sky-100 text-sky-700',        IN_TRANSIT:'bg-blue-100 text-blue-700',
  RECEIVED:'bg-indigo-100 text-indigo-700', COMPLETED:'bg-emerald-100 text-emerald-700',
  CANCELLED:'bg-red-100 text-red-500',       FAILED:'bg-red-100 text-red-700',
}

const inputCls  = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
const labelCls  = 'block text-sm font-medium text-slate-700 mb-1'
const sectionCls = 'text-[11px] font-700 text-slate-400 uppercase tracking-widest mb-3 mt-1'

function VitalRow({ label, value, unit }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value} <span className="text-xs text-slate-400 font-normal">{unit}</span></span>
    </div>
  )
}

function ReferralStatusBadge({ status }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-500'}`}>
      {status?.replace('_',' ')}
    </span>
  )
}

// ── Edit Case Modal ────────────────────────────────────────────────────────────
// PATCH /api/cases/{id}/ — fields from EmergencyCaseUpdateSerializer
function EditCaseModal({ open, onClose, caseData, onSaved }) {
  const [form, setForm]       = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (open && caseData) {
      setError('')
      setForm({
        // Patient fields (editable since serializer flattens them)
        patient_name:         caseData.patient?.patient_name        || '',
        hospital_id:          caseData.patient?.hospital_id         || '',
        patient_phone_number: caseData.patient?.patient_phone_number|| '',
        // Case fields from EmergencyCaseUpdateSerializer
        gestational_age_weeks: caseData.gestational_age_weeks || '',
        gravida:               caseData.gravida   || '',
        parity:                caseData.parity    || '',
        presenting_complaint:  caseData.presenting_complaint || '',
        danger_signs:          caseData.danger_signs || [],
        membranes_status:      caseData.membranes_status || 'unknown',
        fetal_heart_rate:      caseData.fetal_heart_rate || '',
        obstetric_history:     caseData.obstetric_history || '',
        vital_signs: {
          systolic_bp:      caseData.vital_signs?.systolic_bp      || '',
          diastolic_bp:     caseData.vital_signs?.diastolic_bp     || '',
          heart_rate:       caseData.vital_signs?.heart_rate       || '',
          respiratory_rate: caseData.vital_signs?.respiratory_rate || '',
          temperature:      caseData.vital_signs?.temperature      || '',
          spo2:             caseData.vital_signs?.spo2             || '',
        },
      })
    }
  }, [open, caseData])

  const set      = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setV     = k => e => setForm(f => ({ ...f, vital_signs: { ...f.vital_signs, [k]: e.target.value } }))
  const toggleSign = sign => setForm(f => ({
    ...f, danger_signs: f.danger_signs.includes(sign) ? f.danger_signs.filter(s => s !== sign) : [...f.danger_signs, sign],
  }))

  const handleSave = async () => {
    if (!form.presenting_complaint?.trim()) { setError('Presenting complaint is required.'); return }
    setLoading(true); setError('')
    try {
      const vital_signs = {}
      Object.entries(form.vital_signs).forEach(([k, v]) => { if (v !== '' && v !== null) vital_signs[k] = Number(v) })
      // Only send EmergencyCaseUpdateSerializer fields (not patient fields — those are on the Patient model)
      const payload = {
        gestational_age_weeks: form.gestational_age_weeks ? Number(form.gestational_age_weeks) : null,
        gravida:               form.gravida  ? Number(form.gravida)  : null,
        parity:                form.parity   ? Number(form.parity)   : null,
        presenting_complaint:  form.presenting_complaint,
        danger_signs:          form.danger_signs,
        membranes_status:      form.membranes_status,
        fetal_heart_rate:      form.fetal_heart_rate ? Number(form.fetal_heart_rate) : null,
        obstetric_history:     form.obstetric_history,
        vital_signs,
      }
      const { data } = await casesApi.update(caseData.id, payload)
      onSaved(data); onClose()
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to save changes.')
    } finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Case" size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && <Alert type="error" message={error} />}

        <p className={sectionCls}>Obstetric History</p>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelCls}>Gestational Age (wks)</label><input type="number" className={inputCls} value={form.gestational_age_weeks||''} onChange={set('gestational_age_weeks')} min={0} max={45}/></div>
          <div><label className={labelCls}>Gravida</label><input type="number" className={inputCls} value={form.gravida||''} onChange={set('gravida')} min={0}/></div>
          <div><label className={labelCls}>Parity</label><input type="number" className={inputCls} value={form.parity||''} onChange={set('parity')} min={0}/></div>
        </div>
        <div><label className={labelCls}>Obstetric History</label>
          <textarea rows={2} className={inputCls+' resize-none'} value={form.obstetric_history||''} onChange={set('obstetric_history')} placeholder="Prior complications or surgeries..."/></div>

        <p className={sectionCls}>Clinical</p>
        <div><label className={labelCls}>Presenting Complaint <span className="text-red-500">*</span></label>
          <textarea rows={2} className={inputCls+' resize-none'} value={form.presenting_complaint||''} onChange={set('presenting_complaint')} placeholder="Chief complaint..."/></div>
        <div><label className={labelCls}>Danger Signs</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ALL_DANGER_SIGNS.map(sign => (
              <button key={sign} type="button" onClick={() => toggleSign(sign)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${form.danger_signs?.includes(sign)?'bg-red-600 text-white border-red-600':'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                {DANGER_LABELS[sign]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Membranes Status</label>
            <select className={inputCls} value={form.membranes_status||'unknown'} onChange={set('membranes_status')}>
              <option value="unknown">Unknown</option><option value="intact">Intact</option><option value="ruptured">Ruptured</option>
            </select></div>
          <div><label className={labelCls}>Fetal Heart Rate (bpm)</label>
            <input type="number" className={inputCls} value={form.fetal_heart_rate||''} onChange={set('fetal_heart_rate')} min={50} max={250} placeholder="—"/></div>
        </div>

        <p className={sectionCls}>Vital Signs</p>
        <div className="grid grid-cols-3 gap-3">
          {[['systolic_bp','Systolic BP'],['diastolic_bp','Diastolic BP'],['heart_rate','Heart Rate'],['respiratory_rate','Resp. Rate'],['temperature','Temperature'],['spo2','SpO₂']].map(([k,label]) => (
            <div key={k}><label className={labelCls}>{label}</label><input type="number" className={inputCls} value={form.vital_signs?.[k]||''} onChange={setV(k)} placeholder="—"/></div>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
        <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
        <button onClick={handleSave} disabled={loading} className="btn-primary flex-1 justify-center">
          {loading ? <><Spinner size={14} className="text-white"/> Saving…</> : <><CheckCircle size={14}/> Save Changes</>}
        </button>
      </div>
    </Modal>
  )
}

// ── Referral Modal ─────────────────────────────────────────────────────────────
// Step 1 — choose AI suggestion or manual selection
// Step 2a — AI: runs engine, shows ranked facilities; falls back to manual on failure
// Step 2b — manual: fetches all active facilities with live search
// Both paths converge at a confirm footer that handles override_reason when needed
function ReferralModal({ open, onClose, caseData }) {
  const navigate = useNavigate()

  // 'select_mode' | 'suggestion' | 'manual'
  const [step, setStep]                     = useState('select_mode')
  const [suggestion, setSuggestion]         = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError]     = useState('')

  const [allFacilities, setAllFacilities]         = useState([])
  const [facilitiesLoading, setFacilitiesLoading] = useState(false)
  const [facilitySearch, setFacilitySearch]       = useState('')

  const [selected, setSelected]           = useState(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [creating, setCreating]           = useState(false)
  const [saveError, setSaveError]         = useState('')

  // Transport step state
  const [createdReferral, setCreatedReferral] = useState(null)
  const [vehicles, setVehicles]               = useState([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [transportNotes, setTransportNotes]   = useState('')
  const [assigningTransport, setAssigningTransport] = useState(false)
  const [transportError, setTransportError]   = useState('')
  const { submitOrQueue } = useOfflineQueue()
  const [facilitiesFromCache, setFacilitiesFromCache] = useState(false)

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setStep('select_mode')
      setSuggestion(null); setSuggestError('')
      setSelected(null); setOverrideReason(''); setSaveError('')
      setFacilitySearch('')
      setCreatedReferral(null); setVehicles([]); setSelectedVehicle(null)
      setTransportNotes(''); setTransportError('')
    }
  }, [open])

  const runSuggestion = async () => {
    setSuggestLoading(true); setSuggestError('')
    try {
      const { data } = await referralsApi.suggest(caseData.id)
      setSuggestion(data)
      if (data.recommended_facility) {
        setSelected({ id: data.recommended_facility.id, name: data.recommended_facility.name })
      }
    } catch {
      setSuggestError('Could not fetch AI suggestions. You can still select a facility manually.')
    } finally {
      setSuggestLoading(false)
      setStep('suggestion')
    }
  }

  const loadFacilities = async () => {
    setStep('manual')
    if (allFacilities.length > 0) return
    setFacilitiesLoading(true)
    try {
      // Cached so manual facility selection still works with no signal —
      // without this, offline "Manual Selection" would offer nothing to pick.
      const { data, fromCache } = await cachedFetch('facilities_list', () => facilitiesApi.list().then(r => r.data))
      setAllFacilities(Array.isArray(data) ? data : data.results || [])
      setFacilitiesFromCache(fromCache)
    } catch {}
    finally { setFacilitiesLoading(false) }
  }

  const engineRecId   = suggestion?.recommended_facility?.id
  const isOverride    = engineRecId && selected?.id && selected.id !== engineRecId
  const needsOverride = isOverride && !overrideReason.trim()

  const handleCreate = async () => {
    if (!selected) return
    setCreating(true); setSaveError('')
    try {
      const payload = {
        emergency_case_id:        caseData.id,
        receiving_facility_id:    selected.id,
        ...(suggestion?.engine_version && { engine_version: suggestion.engine_version }),
        ...(engineRecId               && { engine_recommendation_id: engineRecId }),
        ...(isOverride                && { override_reason: overrideReason }),
      }
      const result = await submitOrQueue({
        method: 'post',
        url: '/api/referrals/create/',
        data: payload,
        meta: { kind: QueueKinds.REFERRAL_CREATE, label: `Referral to ${selected.name}`, caseId: caseData.id },
      })
      if (result.queued) {
        // No server id yet, so there's no referral to link a transport
        // request to — that has to wait until this syncs. Say so plainly
        // instead of silently skipping the transport step.
        setStep('queued')
      } else {
        setCreatedReferral(result.response.data)
        setStep('transport')
        setVehiclesLoading(true)
        transportApi.vehicles.available()
          .then(({ data: vData }) => setVehicles(Array.isArray(vData) ? vData : vData.results || []))
          .catch(() => {})
          .finally(() => setVehiclesLoading(false))
      }
    } catch (err) {
      const d = err?.response?.data
      setSaveError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to create referral.')
    } finally { setCreating(false) }
  }

  const handleAssignTransport = async () => {
    if (!selectedVehicle || !createdReferral) return
    setAssigningTransport(true); setTransportError('')
    try {
      await transportApi.requests.create({
        vehicle: selectedVehicle.id,
        referral: createdReferral.id,
        ...(transportNotes && { notes: transportNotes }),
      })
      navigate(`/app/referrals/${createdReferral.id}`)
    } catch {
      setTransportError('Transport assigned but could not link to referral. You can assign it manually from the Transport page.')
      setTimeout(() => navigate(`/app/referrals/${createdReferral.id}`), 2500)
    } finally { setAssigningTransport(false) }
  }

  const handleSkipTransport = () => {
    if (createdReferral) navigate(`/app/referrals/${createdReferral.id}`)
    else onClose()
  }

  const filteredFacilities = allFacilities.filter(f =>
    f.name?.toLowerCase().includes(facilitySearch.toLowerCase()) ||
    f.level_display?.toLowerCase().includes(facilitySearch.toLowerCase())
  )

  // Shared confirm footer rendered at the bottom of both suggestion + manual steps
  const ConfirmFooter = () => (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      {selected && (
        <div className="bg-brand-50 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-400 mb-0.5">Selected facility</p>
          <p className="text-sm font-semibold text-brand-700">{selected.name}</p>
          {isOverride && (
            <p className="text-xs text-amber-600 mt-1">⚠ Overriding engine recommendation — reason required below</p>
          )}
        </div>
      )}
      {isOverride && (
        <FormField label="Override Reason" required hint="Required when selecting a different facility than recommended">
          <textarea rows={2} value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
            className="input-field resize-none" placeholder="Explain why you're overriding the recommendation…"/>
        </FormField>
      )}
      {saveError && <Alert type="error" message={saveError}/>}
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
        <button onClick={handleCreate} disabled={!selected || needsOverride || creating} className="btn-primary flex-1 justify-center">
          {creating ? <Spinner size={16} className="text-white"/> : <><ArrowRightLeft size={14}/> Create Referral</>}
        </button>
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title="Create Referral" size="lg">
      <div className="space-y-4">

        {/* ── Mode selection ── */}
        {step === 'select_mode' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">How would you like to select the receiving facility?</p>

            <button onClick={runSuggestion} disabled={suggestLoading}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-brand-200 bg-brand-50 hover:bg-brand-100 transition-colors text-left">
              <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
                {suggestLoading ? <Spinner size={16} className="text-white"/> : <Activity size={16} className="text-white"/>}
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-800">AI Facility Suggestion</p>
                <p className="text-xs text-brand-600 mt-0.5">Engine ranks facilities by danger signs, capacity &amp; distance</p>
              </div>
            </button>

            <button onClick={loadFacilities} disabled={facilitiesLoading}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors text-left">
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                {facilitiesLoading ? <Spinner size={16} className="text-slate-500"/> : <MapPin size={16} className="text-slate-500"/>}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Manual Selection</p>
                <p className="text-xs text-slate-400 mt-0.5">Browse and pick any active facility</p>
              </div>
            </button>
          </div>
        )}

        {/* ── AI suggestion results ── */}
        {step === 'suggestion' && (
          <div className="space-y-3">
            {suggestError && <Alert type="warning" message={suggestError}/>}

            {!suggestError && suggestion && (() => {
              const top  = suggestion.recommended_facility
              const alts = suggestion.alternatives || []
              const all  = [top, ...alts].filter(Boolean)
              return (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {all.map((f, i) => {
                    const isSelected = selected?.id === f.id
                    return (
                      <button key={f.id} type="button"
                        onClick={() => setSelected({ id: f.id, name: f.name })}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-brand-200 bg-white'}`}>
                        <div className="flex items-start gap-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${i === 0 ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-900 text-sm">{f.name}</p>
                              {i === 0 && <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-medium">Recommended</span>}
                              {f.level && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Level {f.level}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
                              {f.distance_km != null && <span className="flex items-center gap-1"><MapPin size={10}/>{f.distance_km?.toFixed(1)} km</span>}
                              {f.composite_score != null && <span className="font-semibold text-brand-600">Score: {Math.round((f.composite_score || 0) * 100)}%</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {all.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No facilities ranked by the engine.</p>}
                </div>
              )
            })()}

            <button onClick={loadFacilities}
              className="w-full text-xs text-brand-600 hover:text-brand-700 font-medium py-1 flex items-center justify-center gap-1">
              <MapPin size={12}/> Select a different facility manually
            </button>

            <ConfirmFooter/>
          </div>
        )}

        {/* ── Manual facility picker ── */}
        {step === 'manual' && (
          <div className="space-y-3">
            <input value={facilitySearch} onChange={e => setFacilitySearch(e.target.value)}
              className="input-field" placeholder="Search by facility name or level…" autoFocus/>
            {facilitiesFromCache && (
              <p className="text-xs text-amber-600">Showing facilities saved from your last connection — may be outdated.</p>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {facilitiesLoading && <div className="flex justify-center py-6"><Spinner size={20} className="text-brand-500"/></div>}
              {!facilitiesLoading && filteredFacilities.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No facilities found.</p>
              )}
              {!facilitiesLoading && filteredFacilities.map(f => {
                const isSelected = selected?.id === f.id
                return (
                  <button key={f.id} type="button"
                    onClick={() => setSelected({ id: f.id, name: f.name })}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-brand-200 bg-white'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                      {f.level && <p className="text-xs text-slate-400 capitalize mt-0.5">Level {f.level}</p>}
                    </div>
                    {isSelected && <CheckCircle size={16} className="text-brand-500 shrink-0"/>}
                  </button>
                )
              })}
            </div>

            <button onClick={() => { setStep('select_mode'); setSuggestion(null) }}
              className="w-full text-xs text-brand-600 hover:text-brand-700 font-medium py-1 flex items-center justify-center gap-1">
              <Activity size={12}/> Try AI suggestion instead
            </button>

            <ConfirmFooter/>
          </div>
        )}

      </div>

        {/* ── Queued-offline confirmation ── */}
        {step === 'queued' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <Clock size={18} className="text-amber-600 shrink-0"/>
              <div>
                <p className="text-sm font-semibold text-amber-800">Referral saved on this device</p>
                <p className="text-xs text-amber-600 mt-0.5">To: {selected?.name} — no connection right now</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              It will be sent to the server automatically once you're back online, and you can assign transport for it after that.
            </p>
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button type="button" onClick={onClose} className="btn-primary flex-1 justify-center">Done</button>
            </div>
          </div>
        )}

        {/* ── Transport assignment step ── */}
        {step === 'transport' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <CheckCircle size={18} className="text-emerald-600 shrink-0"/>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Referral created successfully</p>
                <p className="text-xs text-emerald-600 mt-0.5">To: {createdReferral?.receiving_facility_name}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2"><Truck size={14}/> Assign Transport</p>
              <p className="text-xs text-slate-400 mb-3">Select an available vehicle to assign to this referral, or skip to assign later.</p>

              {vehiclesLoading && <div className="flex justify-center py-6"><Spinner size={20} className="text-brand-500"/></div>}

              {!vehiclesLoading && vehicles.length === 0 && (
                <div className="text-center py-6 text-sm text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                  No vehicles currently available. You can assign transport later from the referral page.
                </div>
              )}

              {!vehiclesLoading && vehicles.length > 0 && (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {vehicles.map(v => {
                    const isSelected = selectedVehicle?.id === v.id
                    const emoji = { AMBULANCE:'🚑', MOTORCYCLE:'🏍️', CAR:'🚗', VAN:'🚐' }[v.vehicle_type] || '🚑'
                    return (
                      <button key={v.id} type="button"
                        onClick={() => setSelectedVehicle(isSelected ? null : v)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-brand-200 bg-white'}`}>
                        <span className="text-xl shrink-0">{emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{v.registration}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{v.make} {v.model} · {v.vehicle_type?.replace(/_/g,' ')}{v.driver_name ? ` · ${v.driver_name}` : ''}</p>
                        </div>
                        {isSelected && <CheckCircle size={16} className="text-brand-500 shrink-0"/>}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedVehicle && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Transport Notes (optional)</label>
                  <textarea rows={2} value={transportNotes} onChange={e => setTransportNotes(e.target.value)}
                    className="input-field resize-none text-sm" placeholder="Location, landmarks, special instructions…"/>
                </div>
              )}

              {transportError && <Alert type="error" message={transportError}/>}
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button type="button" onClick={handleSkipTransport} className="btn-secondary flex-1 justify-center">
                Skip for now
              </button>
              <button type="button" onClick={handleAssignTransport} disabled={!selectedVehicle || assigningTransport} className="btn-primary flex-1 justify-center">
                {assigningTransport ? <Spinner size={16} className="text-white"/> : <><Truck size={14}/> Assign &amp; Finish</>}
              </button>
            </div>
          </div>
        )}

    </Modal>
  )
}

// ── Status Update Modal ────────────────────────────────────────────────────────
// referralsApi.updateStatus(id, status, note) → PATCH { status, note }
function StatusUpdateModal({ open, onClose, referral, onUpdated }) {
  const validNext = VALID_TRANSITIONS[referral?.status] || []
  const [newStatus, setNewStatus] = useState(validNext[0] || '')
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => { if (open) { setNewStatus(validNext[0]||''); setNote(''); setError('') } }, [open])

  const handleSave = async () => {
    if (!newStatus) return
    setSaving(true); setError('')
    try {
      const { data } = await referralsApi.updateStatus(referral.id, newStatus, note)
      onUpdated(data); onClose()
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to update status.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Update Referral Status">
      <Alert type="error" message={error} className="mb-4"/>
      {validNext.length === 0 ? (
        <div>
          <p className="text-sm text-slate-500 py-4 text-center">Referral is in a terminal state (<strong>{referral?.status}</strong>).</p>
          <button onClick={onClose} className="btn-secondary w-full justify-center mt-2">Close</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-sm">
            <ReferralStatusBadge status={referral?.status}/><ChevronRight size={14} className="text-slate-400"/><ReferralStatusBadge status={newStatus}/>
          </div>
          <FormField label="New Status" required>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="input-field">
              {validNext.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
            </select>
          </FormField>
          <FormField label="Note (optional)">
            <input value={note} onChange={e => setNote(e.target.value)} className="input-field" placeholder="Add a note about this transition..."/>
          </FormField>
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? <Spinner size={16} className="text-white"/> : <><RefreshCw size={14}/> Update Status</>}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Transport Modal ────────────────────────────────────────────────────────────
// transportApi.vehicles.available() → Vehicle list
// transportApi.requests.create({ vehicle?, notes? })
function TransportModal({ open, onClose, caseId }) {
  const navigate = useNavigate()
  const [available, setAvailable] = useState([])
  const [form, setForm]   = useState({ vehicle:'', notes:'' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    transportApi.vehicles.available()
      .then(({ data }) => setAvailable(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await transportApi.requests.create({
        ...(form.vehicle && { vehicle: form.vehicle }),
        ...(form.notes   && { notes:  form.notes }),
      })
      onClose(); navigate('/app/transport')
    } catch { setError('Failed to request transport.') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request Transport">
      <Alert type="error" message={error} className="mb-4"/>
      <div className="space-y-4">
        {/* AI dispatch recommendation — analyses case urgency + available vehicles */}
        {caseId && !loading && (
          <TransportRecommendPanel
            caseId={caseId}
            availableVehicles={available}
            onSelect={(vehicleId) => setForm(f => ({ ...f, vehicle: vehicleId }))}
          />
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Select Vehicle">
            {loading ? <Spinner/> : (
              <select value={form.vehicle} onChange={e => setForm(f=>({...f,vehicle:e.target.value}))} className="input-field">
                <option value="">— Any available vehicle —</option>
                {available.map(t => <option key={t.id} value={t.id}>{t.registration} ({t.vehicle_type?.replace(/_/g,' ')}){t.driver_name?` · ${t.driver_name}`:''}</option>)}
              </select>
            )}
          </FormField>
          <FormField label="Notes">
            <textarea rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} className="input-field resize-none" placeholder="Location, landmarks, case reference…"/>
          </FormField>
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? <Spinner size={16} className="text-white"/> : <><Truck size={14}/> Request Transport</>}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

// ── Consultation Modal ─────────────────────────────────────────────────────────
// consultationsApi.specialists.list({ is_available: true }) → SpecialistProfile list
// consultationsApi.create({ specialist?, notes? })
// specialist returns: id, user_name, specialty, specialty_display, is_available
function ConsultationModal({ open, onClose, caseData }) {
  const navigate = useNavigate()
  const [specialists, setSpecialists] = useState([])
  const [form, setForm]       = useState({ specialist:'', notes:'' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoadError('')
    setSpecialists([])
    setForm({ specialist:'', notes:'' })
    setError('')
    consultationsApi.specialists.list({ is_available: true })
      .then(({ data }) => setSpecialists(Array.isArray(data) ? data : data.results || []))
      .catch(() => setLoadError('Could not load specialists. Please try again.'))
      .finally(() => setLoading(false))
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = {
        ...(form.specialist && { specialist: form.specialist }),
        ...(form.notes      && { notes:      form.notes }),
      }
      const { data } = await consultationsApi.create(payload)
      navigate(`/app/consultations/${data.id}`)
    } catch { setError('Failed to request consultation.') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request Teleconsultation">
      <Alert type="error" message={error} className="mb-4"/>
      <Alert type="error" message={loadError} className="mb-4"/>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Specialist" hint="Leave blank to request any available specialist">
          {loading ? <Spinner/> : (
            <select value={form.specialist} onChange={e => setForm(f=>({...f,specialist:e.target.value}))} className="input-field">
              <option value="">— Any available specialist —</option>
              {specialists.map(s => <option key={s.id} value={s.id}>{s.user_name || s.display_name} · {s.specialty_display || s.specialty}</option>)}
            </select>
          )}
        </FormField>
        <FormField label="Notes">
          <textarea rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} className="input-field resize-none" placeholder="Reason for consultation, specific questions…"/>
        </FormField>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={16} className="text-white"/> : <><Video size={14}/> Request Consultation</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Referral Section ───────────────────────────────────────────────────────────
function ReferralSection({ caseId, canManage }) {
  const [referral, setReferral]         = useState(null)
  const [loading, setLoading]           = useState(true)
  const [statusModal, setStatusModal]   = useState(false)
  const { pending, syncVersion } = useOfflineQueue()

  const queuedReferral = pending.find(
    item => item.meta?.kind === QueueKinds.REFERRAL_CREATE && item.meta?.caseId === caseId
  )

  const fetchReferral = useCallback(() => {
    referralsApi.list()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.results || []
        // Match by emergency_case_id which is returned in ReferralListSerializer / ReferralDetailSerializer
        const match = list.find(r => r.emergency_case_id === caseId)
        setReferral(match || null)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [caseId])

  useEffect(() => { fetchReferral() }, [fetchReferral])
  useEffect(() => { if (syncVersion > 0) fetchReferral() }, [syncVersion])

  if (loading) return <div className="card px-5 py-4"><p className="text-xs text-slate-400">Loading referral…</p></div>

  if (!referral) {
    if (queuedReferral) {
      const failed = isQueueItemFailed(queuedReferral)
      return (
        <div className={`card px-5 py-4 border-dashed ${failed ? 'border-danger-200 bg-danger-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Referral</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase flex items-center gap-1 ${failed ? 'bg-danger-100 text-danger-700' : 'bg-amber-100 text-amber-700'}`}>
              {failed ? <AlertOctagon size={10}/> : <Clock size={10}/>} {failed ? 'Sync failed' : 'Pending sync'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {failed
              ? `Saved on this device but couldn't reach the server after ${MAX_RETRIES} tries: ${queuedReferral.lastError || 'unknown error'}. Use the sync icon in the header to retry or discard.`
              : `${queuedReferral.meta?.label || 'Referral'} is saved on this device and will be sent once back online. Transport can be assigned after it syncs.`}
          </p>
        </div>
      )
    }
    return (
      <div className="card px-5 py-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Referral</p>
        <p className="text-sm text-slate-500">No referral created yet. Use the <strong>Refer</strong> button above.</p>
      </div>
    )
  }

  const validNext  = VALID_TRANSITIONS[referral.status] || []
  const isTerminal = validNext.length === 0

  return (
    <>
      <div className="card px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Referral</p>
          <ReferralStatusBadge status={referral.status}/>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700 truncate">{referral.referring_facility_name}</span>
          <ChevronRight size={14} className="text-slate-400 shrink-0"/>
          <span className="font-medium text-slate-700 truncate">{referral.receiving_facility_name}</span>
        </div>
        {(referral.maternal_outcome !== 'unknown' || referral.neonatal_outcome !== 'unknown') && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50 text-xs">
            <div><span className="text-slate-400">Maternal:</span> <span className="font-medium capitalize text-slate-700">{referral.maternal_outcome}</span></div>
            <div><span className="text-slate-400">Neonatal:</span> <span className="font-medium capitalize text-slate-700">{referral.neonatal_outcome}</span></div>
          </div>
        )}
        {canManage && !isTerminal && (
          <div className="pt-1 border-t border-slate-50">
            <button onClick={() => setStatusModal(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 transition-all w-full">
              <RefreshCw size={12}/> Update Status
            </button>
          </div>
        )}
        {isTerminal && <p className="text-xs text-slate-400">Referral is {referral.status.toLowerCase()} — no further actions.</p>}
      </div>
      <StatusUpdateModal open={statusModal} onClose={() => setStatusModal(false)} referral={referral} onUpdated={r => { setReferral(r); setStatusModal(false) }}/>
    </>
  )
}

// ── Case Detail Page ───────────────────────────────────────────────────────────
export default function CaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isHealthWorker, isFacilityAdmin, isSuperAdmin } = useAuth()

  const [caseData,       setCaseData]       = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [note,           setNote]           = useState('')
  const [addingNote,     setAddingNote]     = useState(false)
  const [editModal,      setEditModal]      = useState(false)
  const [referralModal,  setReferralModal]  = useState(false)
  const [transportModal, setTransportModal] = useState(false)
  const [consultModal,   setConsultModal]   = useState(false)

  const canEdit   = isHealthWorker || isFacilityAdmin || isSuperAdmin
  const canAction = isHealthWorker || isFacilityAdmin || isSuperAdmin

  useEffect(() => {
    casesApi.detail(id)
      .then(({ data }) => setCaseData(data))
      .catch(() => setError('Case not found.'))
      .finally(() => setLoading(false))
  }, [id])

  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!note.trim()) return
    setAddingNote(true)
    try {
      const { data } = await casesApi.triageNote(id, note)
      setCaseData(data); setNote('')
    } catch {}
    setAddingNote(false)
  }

  if (loading) return <PageSpinner/>
  if (error)   return <div className="p-6"><Alert type="error" message={error}/></div>

  const c  = caseData
  const vs = c.vital_signs || {}
  // Patient fields: EmergencyCaseDetailSerializer nests patient as PatientSerializer
  const p  = c.patient || {}

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowLeft size={18}/></button>
        <div className="flex-1 min-w-0">
          <h1 className="section-title">Emergency Case</h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{c.id}</p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          {canEdit && <button onClick={() => setEditModal(true)} className="btn-secondary text-xs px-3 py-2"><Pencil size={13}/> Edit</button>}
          {canAction && (
            <>
              <button onClick={() => setTransportModal(true)} className="btn-secondary text-xs px-3 py-2"><Truck size={14}/> Transport</button>
              <button onClick={() => setConsultModal(true)}   className="btn-secondary text-xs px-3 py-2"><Video size={14}/> Consult</button>
              <button onClick={() => setReferralModal(true)}  className="btn-primary text-xs px-3 py-2"><ArrowRightLeft size={14}/> Refer</button>
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Patient — fields from PatientSerializer */}
          <div className="card px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Patient</p>
              {p.id && <Link to={`/app/patients/${p.id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium">View full profile →</Link>}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                ['Name',           p.patient_name         || '—'],
                ['Hospital ID',    p.hospital_id          || '—'],
                ['Phone',          p.patient_phone_number || '—'],
                ['Age',            `${p.age || '—'} years`],
                ['Town',           p.town        || '—'],
                ['Blood Group',    p.blood_group || '—'],
                ['ANC Visits',     p.anc_visits  ?? '—'],
                ['Gravida',        c.gravida     ?? '—'],
                ['Parity',         c.parity      ?? '—'],
                ['Gestational Age',c.gestational_age_weeks ? `${c.gestational_age_weeks} weeks` : '—'],
                ['Membranes',      c.membranes_status || '—'],
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between border-b border-slate-50 py-1.5 last:border-0">
                  <span className="text-xs text-slate-500">{key}</span>
                  <span className="text-sm font-medium text-slate-800 text-right break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Presenting Complaint</p>
              <SpeakButton text={c.presenting_complaint} />
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">{c.presenting_complaint}</p>
          </div>

          <div className="card px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Danger Signs</p>
            <DangerSignList signs={c.danger_signs}/>
          </div>

          {c.obstetric_history && (
            <div className="card px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Obstetric History</p>
              <p className="text-sm text-slate-700 leading-relaxed">{c.obstetric_history}</p>
            </div>
          )}

          {/* Clinical Notes — triage_notes from TriageNoteSerializer */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="font-medium text-slate-800">Clinical Notes</p>
            </div>
            <div className="divide-y divide-slate-50">
              {(c.triage_notes||[]).map(n => (
                <div key={n.id} className="px-5 py-3.5">
                  <p className="text-sm text-slate-800 leading-relaxed">{n.note}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.created_by_name} · {format(new Date(n.created_at), 'dd MMM yyyy, HH:mm')}</p>
                </div>
              ))}
              {!c.triage_notes?.length && <p className="px-5 py-6 text-sm text-center text-slate-400">No clinical notes yet</p>}
            </div>
            <form onSubmit={handleAddNote} className="px-5 py-4 border-t border-slate-100 space-y-3">
              {/* AI triage extraction — only for staff roles, once there's enough text to analyse */}
              {canAction && note.trim().length > 20 && (
                <TriageAIPanel
                  note={note}
                  caseId={c.id}
                  onApply={() => setEditModal(true)}
                />
              )}
              <div className="flex gap-2">
                <input value={note} onChange={e => setNote(e.target.value)} className="input-field flex-1" placeholder="Add a clinical note…"/>
                <button type="submit" disabled={addingNote||!note.trim()} className="btn-primary shrink-0">
                  {addingNote ? <Spinner size={14} className="text-white"/> : <Plus size={14}/>}
                </button>
              </div>
            </form>
          </div>

          {/* AI Handover Brief */}
          {canAction && c.id && (
            <HandoverBriefPanel caseId={c.id} />
          )}
        </div>

        <div className="space-y-5">
          <div className="card px-5 py-4 space-y-3">
            <div><p className="text-xs text-slate-400">Created by</p><p className="text-sm font-medium text-slate-800">{c.created_by_name}</p></div>
            <div><p className="text-xs text-slate-400">Referring Facility</p><p className="text-sm font-medium text-slate-800">{c.referring_facility_name}</p></div>
            <div><p className="text-xs text-slate-400">Recorded</p><p className="text-sm font-medium text-slate-800">{format(new Date(c.created_at), 'dd MMM yyyy, HH:mm')}</p></div>
          </div>

          <ReferralSection caseId={id} canManage={canAction}/>

          <div className="card px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Activity size={12}/> Vital Signs</p>
            <VitalRow label="Systolic BP"  value={vs.systolic_bp}      unit="mmHg"/>
            <VitalRow label="Diastolic BP" value={vs.diastolic_bp}     unit="mmHg"/>
            <VitalRow label="Heart Rate"   value={vs.heart_rate}       unit="bpm"/>
            <VitalRow label="Resp. Rate"   value={vs.respiratory_rate} unit="/min"/>
            <VitalRow label="Temperature"  value={vs.temperature}      unit="°C"/>
            <VitalRow label="SpO₂"         value={vs.spo2}             unit="%"/>
            <VitalRow label="Fetal HR"     value={c.fetal_heart_rate}  unit="bpm"/>
            {!Object.values(vs).some(v=>v) && !c.fetal_heart_rate && (
              <p className="text-xs text-slate-400 text-center py-2">No vitals recorded</p>
            )}
          </div>
        </div>
      </div>

      <EditCaseModal open={editModal} onClose={() => setEditModal(false)} caseData={c} onSaved={updated => { setCaseData(updated); setEditModal(false) }}/>
      {referralModal  && <ReferralModal    open onClose={() => setReferralModal(false)}  caseData={c}/>}
      {transportModal && <TransportModal   open onClose={() => setTransportModal(false)} caseId={c.id}/>}
      {consultModal   && <ConsultationModal open onClose={() => setConsultModal(false)} caseData={c}/>}
    </div>
  )
}
