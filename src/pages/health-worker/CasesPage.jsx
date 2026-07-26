import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { casesApi, facilitiesApi, referralsApi, transportApi, consultationsApi, patientsApi } from '@/api/client'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds, isQueueItemFailed } from '@/utils/offlineQueue'
import { cachedFetch } from '@/utils/cachedFetch'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'
import { StatusBadge, PageSpinner, EmptyState, DangerSignList, Spinner, FormField } from '@/components/ui'
import { ClipboardList, Plus, Clock, AlertTriangle, AlertOctagon, X, ArrowRightLeft, Truck, Video, MapPin, CheckCircle, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'

// Danger sign codes match backend DangerSign.TextChoices exactly
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

// Field names match EmergencyCaseCreateSerializer exactly
const INITIAL_FORM = {
  patient_id:            null,   // set when linking an existing patient
  patient_name:          '',
  patient_phone_number:  '',   // serializer field: patient_phone_number
  hospital_id:           '',
  patient_age:           '',   // serializer field: patient_age (maps to Patient.age)
  patient_town:          '',   // serializer field: patient_town (maps to Patient.town)
  patient_blood_group:   'unknown',
  patient_anc_visits:    0,
  gestational_age_weeks: '',
  gravida:               '',
  parity:                '',
  presenting_complaint:  '',
  danger_signs:          [],
  membranes_status:      'unknown',
  fetal_heart_rate:      '',
  obstetric_history:     '',
  referring_facility:    '',
  vital_signs: { systolic_bp:'', diastolic_bp:'', heart_rate:'', respiratory_rate:'', temperature:'', spo2:'' },
}

const inputStyle = {
  width:'100%', padding:'10px 14px', border:'1px solid #e2e8f0',
  borderRadius:'8px', fontSize:'0.875rem', outline:'none', boxSizing:'border-box', background:'white',
}
const labelStyle  = { display:'block', fontSize:'0.875rem', fontWeight:500, color:'#374151', marginBottom:'6px' }
const sectionStyle = { fontSize:'0.72rem', fontWeight:700, color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'12px', marginTop:'4px' }
const gridStyle    = (cols) => ({ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:'12px', marginBottom:'12px' })

// ── Referral Panel ────────────────────────────────────────────────────────────
// Uses referralsApi.suggest(caseId) → { success, recommended_facility, alternatives, engine_version }
// referralsApi.create({ emergency_case_id, receiving_facility_id, engine_recommendation_id, engine_version, override_reason })
function ReferralPanel({ caseData, onDone, navigate }) {
  const [recommended,   setRecommended]   = useState(null)
  const [alternatives,  setAlternatives]  = useState([])
  const [engineVersion, setEngineVersion] = useState('')
  const [selected,      setSelected]      = useState(null)
  const [override,      setOverride]      = useState('')
  const [loading,       setLoading]       = useState(true)
  const [creating,      setCreating]      = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    referralsApi.suggest(caseData.id)
      .then(({ data }) => {
        setRecommended(data.recommended_facility || null)
        setAlternatives(data.alternatives || [])
        setEngineVersion(data.engine_version || '')
        if (data.recommended_facility) setSelected(data.recommended_facility)
      })
      .catch(() => setError('Could not load suggestions. Check your network and try again.'))
      .finally(() => setLoading(false))
  }, [caseData.id])

  const allOptions = [recommended, ...alternatives].filter(Boolean)
  const needsOverride = selected && recommended && selected.id !== recommended.id

  const handleCreate = async () => {
    setError(''); setCreating(true)
    try {
      const payload = {
        emergency_case_id:        caseData.id,
        receiving_facility_id:    selected.id,
        engine_recommendation_id: recommended?.id || null,
        engine_version:           engineVersion,
        override_reason:          override,
      }
      const { data } = await referralsApi.create(payload)
      navigate(`/app/referrals/${data.id}`)
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to create referral.')
      setCreating(false)
    }
  }

  if (loading) return (
    <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 0', gap:'12px'}}>
      <Spinner size={28} />
      <p style={{fontSize:'0.875rem', color:'#64748b'}}>Analysing case with AI engine…</p>
    </div>
  )

  return (
    <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
      {error && <div style={{background:'#fff4f2', border:'1px solid #ffd0c8', borderRadius:'8px', padding:'10px 14px', color:'#c02812', fontSize:'0.85rem'}}>{error}</div>}

      <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
        {allOptions.map((s, i) => (
          <button key={s.id} type="button" onClick={() => setSelected(s)}
            style={{
              width:'100%', textAlign:'left', padding:'14px', borderRadius:'12px',
              border: selected?.id === s.id ? '2px solid #207652' : '2px solid #f1f5f9',
              background: selected?.id === s.id ? '#f0faf5' : 'white',
              cursor:'pointer', transition:'all 0.15s',
            }}>
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px'}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap'}}>
                  <span style={{width:'20px', height:'20px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight:700, flexShrink:0, background:i===0?'#207652':'#e2e8f0', color:i===0?'white':'#475569'}}>{i+1}</span>
                  <p style={{fontWeight:600, fontSize:'0.875rem', color:'#0f172a', margin:0}}>{s.name}</p>
                  {i===0 && <span style={{fontSize:'0.65rem', background:'#dcfce7', color:'#166534', padding:'2px 6px', borderRadius:'4px', fontWeight:500}}>Recommended</span>}
                  <span style={{fontSize:'0.65rem', background:'#f1f5f9', color:'#475569', padding:'2px 6px', borderRadius:'4px'}}>Level {s.level}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'12px', marginTop:'6px', marginLeft:'28px', flexWrap:'wrap'}}>
                  {s.distance_km != null && (
                    <span style={{fontSize:'0.75rem', color:'#64748b', display:'flex', alignItems:'center', gap:'4px'}}>
                      <MapPin size={10}/>{s.distance_km?.toFixed(1)} km
                    </span>
                  )}
                  {s.composite_score != null && (
                    <span style={{fontSize:'0.75rem', fontWeight:600, color:'#207652'}}>Score: {Math.round((s.composite_score||0)*100)}%</span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
        {allOptions.length === 0 && !error && (
          <div style={{textAlign:'center', padding:'32px 0', background:'#f8fafc', borderRadius:'12px'}}>
            <p style={{fontSize:'1.5rem', marginBottom:'8px'}}>🏥</p>
            <p style={{fontSize:'0.875rem', fontWeight:600, color:'#475569', marginBottom:'4px'}}>No AI suggestions available</p>
            <p style={{fontSize:'0.75rem', color:'#94a3b8', maxWidth:'280px', margin:'0 auto'}}>
              No suitable facilities found. You can still create the referral manually from the case detail page.
            </p>
          </div>
        )}
      </div>

      {needsOverride && (
        <div>
          <label style={labelStyle}>Override reason <span style={{color:'#e43418'}}>*</span></label>
          <p style={{fontSize:'0.75rem', color:'#94a3b8', marginBottom:'6px', marginTop:0}}>Required because you selected a different facility than recommended</p>
          <textarea rows={2} value={override} onChange={e => setOverride(e.target.value)}
            style={{...inputStyle, resize:'vertical'}} placeholder="Explain why you're overriding the engine recommendation..." />
        </div>
      )}

      <div style={{display:'flex', gap:'10px', paddingTop:'12px', borderTop:'1px solid #f1f5f9'}}>
        <button type="button" onClick={onDone}
          style={{flex:1, padding:'11px', background:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:'pointer', color:'#475569'}}>
          Skip for now
        </button>
        <button type="button" disabled={!selected || creating || (needsOverride && !override)} onClick={handleCreate}
          style={{flex:2, padding:'11px', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
            background:(!selected || creating || (needsOverride && !override)) ? '#7cb99a' : '#207652',
            color:'white', border:'none', cursor:(!selected || creating) ? 'not-allowed' : 'pointer'}}>
          {creating ? <><Spinner size={14} className="text-white"/> Creating Referral…</> : <><ArrowRightLeft size={14}/> Create Referral</>}
        </button>
      </div>
    </div>
  )
}

// ── Transport Panel ───────────────────────────────────────────────────────────
// Uses transportApi.vehicles.available() and transportApi.requests.create()
// TransportRequest.create fields: { vehicle (UUID)?, referral (UUID)?, notes?, status? }
function TransportPanel({ caseData, onDone, navigate }) {
  const [available, setAvailable] = useState([])
  const [form, setForm]   = useState({ vehicle: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    transportApi.vehicles.available()
      .then(({ data }) => setAvailable(Array.isArray(data) ? data : data.results || []))
      .catch(() => setError('Could not load vehicles.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async () => {
    setSaving(true)
    try {
      // TransportRequest links to referral (not emergency_case directly)
      // Use notes to carry pickup context since the model has no emergency_case FK
      await transportApi.requests.create({
        ...(form.vehicle && { vehicle: form.vehicle }),
        ...(form.notes   && { notes:  form.notes }),
      })
      navigate('/app/transport')
    } catch {
      setError('Failed to request transport.')
      setSaving(false)
    }
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
      {error && <div style={{background:'#fff4f2', border:'1px solid #ffd0c8', borderRadius:'8px', padding:'10px 14px', color:'#c02812', fontSize:'0.85rem'}}>{error}</div>}
      <div>
        <label style={labelStyle}>Select Vehicle</label>
        {loading ? <Spinner /> : (
          <select value={form.vehicle} onChange={e => setForm(f => ({...f, vehicle: e.target.value}))} style={inputStyle}>
            <option value="">— Any available —</option>
            {available.map(t => (
              <option key={t.id} value={t.id}>
                {t.registration} ({t.vehicle_type?.replace(/_/g,' ')}){t.driver_name ? ` · ${t.driver_name}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
          style={{...inputStyle, resize:'vertical'}} placeholder="Location details, landmarks, case reference…" />
      </div>
      <div style={{display:'flex', gap:'10px', paddingTop:'12px', borderTop:'1px solid #f1f5f9'}}>
        <button type="button" onClick={onDone}
          style={{flex:1, padding:'11px', background:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:'pointer', color:'#475569'}}>
          Skip for now
        </button>
        <button type="button" disabled={saving} onClick={handleSubmit}
          style={{flex:2, padding:'11px', background:saving?'#7cb99a':'#207652', color:'white', border:'none', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:saving?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px'}}>
          {saving ? <><Spinner size={14} className="text-white"/> Requesting…</> : <><Truck size={14}/> Request Transport</>}
        </button>
      </div>
    </div>
  )
}

// ── Consultation Panel ────────────────────────────────────────────────────────
// consultationsApi.create fields: { specialist (UUID)?, referral (UUID)?, notes?, status? }
// specialist resolved from consultationsApi.specialists.available()
// SpecialistProfile returns: id, user_name, specialty, specialty_display, is_available
function ConsultationPanel({ caseData, onDone, navigate }) {
  const [specialists, setSpecialists] = useState([])
  const [form, setForm]   = useState({ specialist: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    consultationsApi.specialists.available()
      .then(({ data }) => setSpecialists(Array.isArray(data) ? data : data.results || []))
      .catch(() => setError('Could not load specialists.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const { data } = await consultationsApi.create({
        ...(form.specialist && { specialist: form.specialist }),
        ...(form.notes      && { notes:      form.notes }),
      })
      navigate(`/app/consultations/${data.id}`)
    } catch {
      setError('Failed to request consultation.')
      setSaving(false)
    }
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
      {error && <div style={{background:'#fff4f2', border:'1px solid #ffd0c8', borderRadius:'8px', padding:'10px 14px', color:'#c02812', fontSize:'0.85rem'}}>{error}</div>}
      <div>
        <label style={labelStyle}>Specialist</label>
        <p style={{fontSize:'0.75rem', color:'#94a3b8', marginBottom:'6px', marginTop:0}}>Leave blank to request any available specialist</p>
        {loading ? <Spinner /> : (
          <select value={form.specialist} onChange={e => setForm(f => ({...f, specialist: e.target.value}))} style={inputStyle}>
            <option value="">— Any available —</option>
            {specialists.map(s => (
              <option key={s.id} value={s.id}>{s.user_name} · {s.specialty_display || s.specialty}</option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
          style={{...inputStyle, resize:'vertical'}} placeholder="Reason for consultation, specific questions…" />
      </div>
      <div style={{display:'flex', gap:'10px', paddingTop:'12px', borderTop:'1px solid #f1f5f9'}}>
        <button type="button" onClick={onDone}
          style={{flex:1, padding:'11px', background:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:'pointer', color:'#475569'}}>
          Skip for now
        </button>
        <button type="button" disabled={saving} onClick={handleSubmit}
          style={{flex:2, padding:'11px', background:saving?'#7cb99a':'#207652', color:'white', border:'none', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:saving?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px'}}>
          {saving ? <><Spinner size={14} className="text-white"/> Requesting…</> : <><Video size={14}/> Book Consultation</>}
        </button>
      </div>
    </div>
  )
}

// ── Action Picker (step 2) ────────────────────────────────────────────────────
function ActionPicker({ caseData, onClose, navigate }) {
  const [activePanel, setActivePanel] = useState(null)

  const actions = [
    { key:'refer',     icon:<ArrowRightLeft size={20} color="#207652"/>, label:'Make a Referral',    description:'Get AI facility suggestions and refer the patient', recommended:true },
    { key:'transport', icon:<Truck size={20} color="#0369a1"/>,          label:'Request Transport',  description:'Dispatch a vehicle to the patient' },
    { key:'consult',   icon:<Video size={20} color="#7c3aed"/>,          label:'Book a Consultation',description:'Connect with a specialist for clinical advice' },
  ]

  const handleDone = () => { navigate(`/app/cases/${caseData.id}`); onClose() }

  if (activePanel === 'refer')     return <div><button type="button" onClick={() => setActivePanel(null)} style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',cursor:'pointer',color:'#64748b',fontSize:'0.825rem',marginBottom:'16px',padding:0}}>← Back</button><ReferralPanel    caseData={caseData} onDone={handleDone} navigate={navigate}/></div>
  if (activePanel === 'transport') return <div><button type="button" onClick={() => setActivePanel(null)} style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',cursor:'pointer',color:'#64748b',fontSize:'0.825rem',marginBottom:'16px',padding:0}}>← Back</button><TransportPanel   caseData={caseData} onDone={handleDone} navigate={navigate}/></div>
  if (activePanel === 'consult')   return <div><button type="button" onClick={() => setActivePanel(null)} style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',cursor:'pointer',color:'#64748b',fontSize:'0.825rem',marginBottom:'16px',padding:0}}>← Back</button><ConsultationPanel caseData={caseData} onDone={handleDone} navigate={navigate}/></div>

  return (
    <div>
      <div style={{background:'#f0faf5', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px'}}>
        <CheckCircle size={18} color="#16a34a" style={{flexShrink:0}}/>
        <div>
          <p style={{margin:0, fontSize:'0.875rem', fontWeight:600, color:'#15803d'}}>Case created successfully</p>
          <p style={{margin:0, fontSize:'0.75rem', color:'#166534', marginTop:'2px'}}>What would you like to do next for this patient?</p>
        </div>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
        {actions.map(a => (
          <button key={a.key} type="button" onClick={() => setActivePanel(a.key)}
            style={{width:'100%', textAlign:'left', padding:'14px 16px', borderRadius:'10px', border:a.recommended?'2px solid #207652':'1px solid #e2e8f0', background:a.recommended?'#f0faf5':'white', cursor:'pointer', display:'flex', alignItems:'center', gap:'14px', transition:'all 0.15s'}}>
            <div style={{width:'40px', height:'40px', borderRadius:'10px', flexShrink:0, background:a.recommended?'#dcfce7':'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center'}}>
              {a.icon}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                <p style={{margin:0, fontSize:'0.875rem', fontWeight:600, color:'#0f172a'}}>{a.label}</p>
                {a.recommended && <span style={{fontSize:'0.65rem', background:'#207652', color:'white', padding:'2px 6px', borderRadius:'4px', fontWeight:500}}>Recommended</span>}
              </div>
              <p style={{margin:0, fontSize:'0.75rem', color:'#64748b', marginTop:'2px'}}>{a.description}</p>
            </div>
            <ChevronRight size={16} color="#94a3b8" style={{flexShrink:0}}/>
          </button>
        ))}
      </div>
      <div style={{paddingTop:'16px', marginTop:'8px', borderTop:'1px solid #f1f5f9'}}>
        <button type="button" onClick={handleDone}
          style={{width:'100%', padding:'11px', background:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:'pointer', color:'#475569'}}>
          Done — View Case
        </button>
      </div>
    </div>
  )
}

// ── Patient Search Step ──────────────────────────────────────────────────────
function PatientSearchStep({ onSelect, onSkip }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true); setSearched(true)
    try {
      const { data } = await patientsApi.list({ q: query.trim() })
      setResults(Array.isArray(data) ? data : data.results || [])
    } catch {
      setResults([])
    } finally { setLoading(false) }
  }

  const RISK_COLORS = {
    high:   { background:'#fef2f2', color:'#dc2626', border:'#fecaca' },
    medium: { background:'#fffbeb', color:'#d97706', border:'#fde68a' },
    low:    { background:'#f0fdf4', color:'#16a34a', border:'#bbf7d0' },
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ background:'#f0faf5', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'12px 16px' }}>
        <p style={{ margin:0, fontSize:'0.875rem', fontWeight:600, color:'#15803d' }}>Search for an existing patient</p>
        <p style={{ margin:0, fontSize:'0.75rem', color:'#166534', marginTop:'3px' }}>Linking an existing record prevents duplicates and preserves their full history</p>
      </div>

      <form onSubmit={handleSearch} style={{ display:'flex', gap:'8px' }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, hospital ID, or phone number…"
          style={{ ...inputStyle, flex:1 }}
          autoFocus
        />
        <button type="submit" disabled={loading || !query.trim()}
          style={{ padding:'10px 18px', background:(!query.trim() || loading)?'#7cb99a':'#207652', color:'white', border:'none', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:(!query.trim() || loading)?'not-allowed':'pointer', whiteSpace:'nowrap' }}>
          {loading ? '…' : 'Search'}
        </button>
      </form>

      {searched && results.length === 0 && !loading && (
        <p style={{ textAlign:'center', fontSize:'0.875rem', color:'#94a3b8', padding:'16px 0' }}>No patients found. You can create a new patient below.</p>
      )}

      {results.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxHeight:'280px', overflowY:'auto' }}>
          {results.map(p => {
            const rc = RISK_COLORS[p.risk_level] || RISK_COLORS.low
            return (
              <button key={p.id} type="button" onClick={() => onSelect(p)}
                style={{ textAlign:'left', padding:'12px 14px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'white', cursor:'pointer', transition:'all 0.15s' }}
                onMouseOver={e => e.currentTarget.style.borderColor='#207652'}
                onMouseOut={e => e.currentTarget.style.borderColor='#e2e8f0'}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                      <p style={{ margin:0, fontSize:'0.875rem', fontWeight:600, color:'#0f172a' }}>{p.patient_name || 'Unnamed patient'}</p>
                      <span style={{ fontSize:'0.7rem', padding:'2px 7px', borderRadius:'20px', fontWeight:600, background:rc.background, color:rc.color, border:`1px solid ${rc.border}` }}>
                        {p.risk_level?.toUpperCase()} RISK
                      </span>
                    </div>
                    <p style={{ margin:0, marginTop:'3px', fontSize:'0.75rem', color:'#64748b' }}>
                      ID: {p.hospital_id || '—'} · Age {p.age} · {p.town || '—'} · {p.anc_visits} ANC visit{p.anc_visits !== 1 ? 's' : ''}
                    </p>
                    {p.case_count > 0 && (
                      <p style={{ margin:0, marginTop:'2px', fontSize:'0.7rem', color:'#94a3b8' }}>{p.case_count} previous case{p.case_count !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  <span style={{ fontSize:'0.8rem', color:'#207652', fontWeight:600, flexShrink:0, marginTop:'2px' }}>Select →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display:'flex', gap:'10px', paddingTop:'12px', borderTop:'1px solid #f1f5f9' }}>
        <button type="button" onClick={onSkip}
          style={{ flex:1, padding:'11px', background:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:'pointer', color:'#475569' }}>
          Create new patient
        </button>
      </div>
    </div>
  )
}

// ── Create Case Modal ─────────────────────────────────────────────────────────
function CreateCaseModal({ open, onClose, onCreated }) {
  const navigate = useNavigate()
  const [step, setStep]               = useState(0) // 0=patient search, 1=case form, 2=actions, 3=queued offline
  const [createdCase, setCreatedCase] = useState(null)
  const [form, setForm]               = useState(INITIAL_FORM)
  const [facilities, setFacilities]   = useState([])
  const [facilitiesFromCache, setFacilitiesFromCache] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const { submitOrQueue } = useOfflineQueue()

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM); setError(''); setStep(0); setCreatedCase(null)
      // Cached so the required "Referring Facility" field still has options
      // offline — without this, the case form is unusable with no signal.
      cachedFetch('facilities_list', () => facilitiesApi.list().then(r => r.data))
        .then(({ data, fromCache }) => {
          setFacilities(Array.isArray(data) ? data : data.results || [])
          setFacilitiesFromCache(fromCache)
        })
        .catch(() => setError('Could not load facilities.'))
    }
  }, [open])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setVital = k => e => setForm(f => ({ ...f, vital_signs: { ...f.vital_signs, [k]: e.target.value } }))
  const setVoiceField = k => (v) => setForm(f => ({ ...f, [k]: v }))

  // Every free-text field on this form, in the order it's displayed.
  // Dropdowns (blood group, membranes), the danger-sign multi-select, and
  // number-only fields (age, ANC visits, gestational age, gravida, parity,
  // vitals, fetal heart rate) are intentionally excluded — see useVoiceEntry.
  // Declared (and useVoiceEntry called) before the `if (!open)` guard below
  // so this hook runs unconditionally on every render (Rules of Hooks) —
  // this was previously placed after the guard, which crashed React with a
  // "rendered fewer hooks than expected" error the moment this modal opened.
  const voiceFields = [
    ...(!form.patient_id ? [
      { key: 'patient_name', label: 'Patient Name', get: () => form.patient_name, set: setVoiceField('patient_name') },
      { key: 'hospital_id', label: 'Hospital ID', get: () => form.hospital_id, set: setVoiceField('hospital_id') },
      { key: 'patient_phone_number', label: 'Phone Number', get: () => form.patient_phone_number, set: setVoiceField('patient_phone_number') },
      { key: 'patient_town', label: 'Town', get: () => form.patient_town, set: setVoiceField('patient_town') },
    ] : []),
    { key: 'obstetric_history', label: 'Obstetric History', get: () => form.obstetric_history, set: setVoiceField('obstetric_history') },
    { key: 'presenting_complaint', label: 'Presenting Complaint', get: () => form.presenting_complaint, set: setVoiceField('presenting_complaint') },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  if (!open) return null

  const toggleSign = sign => setForm(f => ({
    ...f,
    danger_signs: f.danger_signs.includes(sign) ? f.danger_signs.filter(s => s !== sign) : [...f.danger_signs, sign],
  }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.patient_age)             { setError('Patient age is required.'); return }
    if (!form.presenting_complaint.trim()) { setError('Presenting complaint is required.'); return }
    if (!form.referring_facility)      { setError('Please select a referring facility.'); return }
    setError(''); setLoading(true)
    try {
      const vital_signs = {}
      Object.entries(form.vital_signs).forEach(([k, v]) => { if (v !== '') vital_signs[k] = Number(v) })

      // Payload keys match EmergencyCaseCreateSerializer fields exactly
      // If linking existing patient, use patient_id and send minimal case fields
      const isExistingPatient = !!form.patient_id
      const payload = isExistingPatient ? {
        patient_id:            form.patient_id,
        presenting_complaint:  form.presenting_complaint.trim(),
        danger_signs:          form.danger_signs,
        gestational_age_weeks: form.gestational_age_weeks ? Number(form.gestational_age_weeks) : null,
        gravida:               form.gravida  ? Number(form.gravida)  : null,
        parity:                form.parity   ? Number(form.parity)   : null,
        membranes_status:      form.membranes_status,
        fetal_heart_rate:      form.fetal_heart_rate ? Number(form.fetal_heart_rate) : null,
        obstetric_history:     form.obstetric_history.trim(),
        vital_signs:           (() => { const vs = {}; Object.entries(form.vital_signs).forEach(([k,v]) => { if (v !== '') vs[k]=Number(v) }); return vs })(),
        referring_facility:    form.referring_facility,
      } : {
        patient_name:          form.patient_name.trim(),
        patient_age:           Number(form.patient_age),
        patient_phone_number:  form.patient_phone_number.trim(),
        hospital_id:           form.hospital_id.trim(),
        patient_town:          form.patient_town.trim(),      // serializer uses patient_town not patient_district
        patient_blood_group:   form.patient_blood_group,
        patient_anc_visits:    Number(form.patient_anc_visits) || 0,
        presenting_complaint:  form.presenting_complaint.trim(),
        danger_signs:          form.danger_signs,
        gestational_age_weeks: form.gestational_age_weeks ? Number(form.gestational_age_weeks) : null,
        gravida:               form.gravida  ? Number(form.gravida)  : null,
        parity:                form.parity   ? Number(form.parity)   : null,
        membranes_status:      form.membranes_status,
        fetal_heart_rate:      form.fetal_heart_rate ? Number(form.fetal_heart_rate) : null,
        obstetric_history:     form.obstetric_history.trim(),
        vital_signs,
        referring_facility:    form.referring_facility,
      }
      const facilityLabel = facilities.find(f => f.id === form.referring_facility)?.name || 'facility'
      const result = await submitOrQueue({
        method: 'post',
        url: '/api/cases/',
        data: payload,
        meta: { kind: QueueKinds.CASE_CREATE, label: `${form.patient_name || 'Case'} — ${facilityLabel}` },
      })
      if (result.queued) {
        setStep(3)
      } else {
        onCreated?.(result.response.data)
        setCreatedCase(result.response.data)
        setStep(2)
      }
    } catch (err) {
      const d = err?.response?.data
      if (d && typeof d === 'object') {
        // Flatten DRF errors: handles strings, arrays, and nested objects (e.g. vital_signs.systolic_bp)
        const msgs = Object.entries(d).flatMap(([k, v]) => {
          if (Array.isArray(v))        return v.map(m => `${k}: ${m}`)
          if (typeof v === 'object' && v !== null)
            return Object.entries(v).flatMap(([sk, sv]) =>
              Array.isArray(sv) ? sv.map(m => `${k}.${sk}: ${m}`) : [`${k}.${sk}: ${sv}`]
            )
          return [`${k}: ${v}`]
        })
        setError(msgs.join(' · ') || 'Failed to create case.')
      } else {
        setError('Failed to create case. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => { onClose(); setStep(1); setCreatedCase(null) }

  return (
    <div style={{position:'fixed', inset:0, zIndex:50, overflowY:'auto', background:'rgba(15,23,42,0.45)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px'}}
      onClick={step===1 ? handleClose : undefined}>
      <div style={{position:'relative', background:'white', borderRadius:'16px', width:'100%', maxWidth:(step===2||step===3)?'520px':'680px', margin:'40px auto', boxShadow:'0 25px 50px rgba(0,0,0,0.35)', transition:'max-width 0.2s ease'}}
        onClick={e => e.stopPropagation()}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:'1px solid #f1f5f9', position:'sticky', top:0, background:'white', borderRadius:'16px 16px 0 0', zIndex:10}}>
          <div>
            <h2 style={{margin:0, fontSize:'1.1rem', fontWeight:600, color:'#0f172a'}}>{step===0?'Find Patient':step===1?'New Emergency Case':step===3?'Case Saved':'Next Steps'}</h2>
            <p style={{margin:0, fontSize:'0.8rem', color:'#64748b'}}>{step===0?'Step 1 of 3 — Search existing patient':step===1?'Step 2 of 3 — Case details':step===3?'Saved offline':'Step 3 of 3 — Next action'}</p>
          </div>
          {step===1 && <button onClick={handleClose} style={{background:'none', border:'none', cursor:'pointer', color:'#64748b', padding:'4px', borderRadius:'8px'}}><X size={18}/></button>}
        </div>

        <div style={{padding:'20px 24px'}}>
          {step===0 && (
            <PatientSearchStep
              onSelect={(p) => {
                setForm(f => ({
                  ...f,
                  patient_id:           p.id,
                  patient_name:         p.patient_name || '',
                  hospital_id:          p.hospital_id  || '',
                  patient_phone_number: p.patient_phone_number || '',
                  patient_age:          String(p.age || ''),
                  patient_town:         p.town || '',
                  patient_blood_group:  p.blood_group || 'unknown',
                  patient_anc_visits:   p.anc_visits || 0,
                }))
                setStep(1)
              }}
              onSkip={() => { setForm(f => ({ ...f, patient_id: null })); setStep(1) }}
            />
          )}
                    {step===1 && (
            <form onSubmit={handleSubmit} noValidate>
              {error && <div style={{background:'#fff4f2', border:'1px solid #ffd0c8', borderRadius:'8px', padding:'10px 14px', color:'#c02812', fontSize:'0.85rem', marginBottom:'16px'}}>{error}</div>}

              <div style={{marginBottom:'16px'}}>
                <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
              </div>

              <p style={sectionStyle}>Patient Identity</p>
              <div style={gridStyle(2)}>
                <div><label style={labelStyle}>Patient Name</label><input value={form.patient_name} onChange={set('patient_name')} placeholder="Full name" style={inputStyle}/></div>
                <div><label style={labelStyle}>Hospital ID</label><input value={form.hospital_id} onChange={set('hospital_id')} placeholder="e.g. KBTH-001-2026" style={inputStyle}/></div>
                <div><label style={labelStyle}>Phone Number</label><input type="tel" value={form.patient_phone_number} onChange={set('patient_phone_number')} placeholder="e.g. 0244000000" style={inputStyle}/></div>
                <div><label style={labelStyle}>Age <span style={{color:'#e43418'}}>*</span></label><input type="number" min={10} max={60} value={form.patient_age} onChange={set('patient_age')} placeholder="e.g. 28" style={inputStyle}/></div>
              </div>

              <p style={sectionStyle}>Patient Details</p>
              <div style={gridStyle(3)}>
                <div><label style={labelStyle}>Town</label><input value={form.patient_town} onChange={set('patient_town')} placeholder="e.g. Kumasi" style={inputStyle}/></div>
                <div><label style={labelStyle}>Blood Group</label>
                  <select value={form.patient_blood_group} onChange={set('patient_blood_group')} style={inputStyle}>
                    {['A+','A-','B+','B-','AB+','AB-','O+','O-','unknown'].map(g=><option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>ANC Visits</label><input type="number" min={0} value={form.patient_anc_visits} onChange={set('patient_anc_visits')} placeholder="0" style={inputStyle}/></div>
              </div>

              <p style={sectionStyle}>Facility</p>
              {facilitiesFromCache && (
                <p style={{fontSize:'0.75rem', color:'#b45309', marginTop:0, marginBottom:'8px'}}>Showing facilities saved from your last connection — may be outdated.</p>
              )}
              <div style={{marginBottom:'12px'}}>
                <label style={labelStyle}>Referring Facility <span style={{color:'#e43418'}}>*</span></label>
                <select value={form.referring_facility} onChange={set('referring_facility')} style={inputStyle}>
                  <option value="">— Select referring facility —</option>
                  {facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <p style={sectionStyle}>Obstetric History</p>
              <div style={gridStyle(3)}>
                <div><label style={labelStyle}>Gestational Age (wks)</label><input type="number" min={0} max={45} value={form.gestational_age_weeks} onChange={set('gestational_age_weeks')} placeholder="e.g. 36" style={inputStyle}/></div>
                <div><label style={labelStyle}>Gravida</label><input type="number" min={0} value={form.gravida} onChange={set('gravida')} placeholder="e.g. 2" style={inputStyle}/></div>
                <div><label style={labelStyle}>Parity</label><input type="number" min={0} value={form.parity} onChange={set('parity')} placeholder="e.g. 1" style={inputStyle}/></div>
              </div>
              <div style={{marginBottom:'12px'}}>
                <label style={labelStyle}>Obstetric History</label>
                <textarea rows={2} value={form.obstetric_history} onChange={set('obstetric_history')} placeholder="Relevant prior complications or surgeries..." style={{...inputStyle, resize:'vertical', width:'100%'}}/>
              </div>

              <p style={sectionStyle}>Clinical</p>
              <div style={{marginBottom:'12px'}}>
                <label style={labelStyle}>Presenting Complaint <span style={{color:'#e43418'}}>*</span></label>
                <textarea rows={2} value={form.presenting_complaint} onChange={set('presenting_complaint')} placeholder="Chief complaint in your own words..." style={{...inputStyle, resize:'vertical', width:'100%'}}/>
              </div>

              <div style={{marginBottom:'16px'}}>
                <p style={sectionStyle}>Danger Signs</p>
                <div style={{display:'flex', flexWrap:'wrap', gap:'8px'}}>
                  {ALL_DANGER_SIGNS.map(sign => (
                    <button key={sign} type="button" onClick={() => toggleSign(sign)}
                      style={{padding:'6px 12px', borderRadius:'8px', fontSize:'0.8rem', fontWeight:500, cursor:'pointer', transition:'all 0.15s',
                        background:form.danger_signs.includes(sign)?'#c02812':'white',
                        color:     form.danger_signs.includes(sign)?'white':'#475569',
                        border:    form.danger_signs.includes(sign)?'1px solid #c02812':'1px solid #e2e8f0'}}>
                      {DANGER_LABELS[sign]}
                    </button>
                  ))}
                </div>
              </div>

              <p style={sectionStyle}>Vital Signs <span style={{textTransform:'none', fontWeight:400, fontSize:'0.72rem'}}>(record what's available)</span></p>
              <div style={gridStyle(3)}>
                {[['systolic_bp','Systolic BP (mmHg)'],['diastolic_bp','Diastolic BP (mmHg)'],['heart_rate','Heart Rate (bpm)'],['respiratory_rate','Resp. Rate (/min)'],['temperature','Temperature (°C)'],['spo2','SpO₂ (%)']].map(([k,label]) => (
                  <div key={k}><label style={labelStyle}>{label}</label><input type="number" value={form.vital_signs[k]} onChange={setVital(k)} placeholder="—" style={inputStyle}/></div>
                ))}
              </div>
              <div style={gridStyle(2)}>
                <div><label style={labelStyle}>Fetal Heart Rate (bpm)</label><input type="number" min={50} max={250} value={form.fetal_heart_rate} onChange={set('fetal_heart_rate')} placeholder="—" style={inputStyle}/></div>
                <div><label style={labelStyle}>Membranes Status</label>
                  <select value={form.membranes_status} onChange={set('membranes_status')} style={inputStyle}>
                    <option value="unknown">Unknown</option><option value="intact">Intact</option><option value="ruptured">Ruptured</option>
                  </select>
                </div>
              </div>

              <div style={{display:'flex', gap:'10px', paddingTop:'16px', borderTop:'1px solid #f1f5f9', marginTop:'8px'}}>
                <button type="button" onClick={handleClose} style={{flex:1, padding:'11px', background:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:'pointer', color:'#475569'}}>Cancel</button>
                <button type="submit" disabled={loading} style={{flex:2, padding:'11px', background:loading?'#7cb99a':'#207652', color:'white', border:'none', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px'}}>
                  {loading ? <><Spinner size={14} className="text-white"/> Creating…</> : 'Create Case →'}
                </button>
              </div>
              <VoiceEntryBar voiceEntry={voiceEntry} />
            </form>
          )}
          {step===2 && createdCase && (
            <ActionPicker caseData={createdCase} onClose={handleClose} navigate={navigate}/>
          )}
          {step===3 && (
            <div>
              <div style={{display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'12px', marginBottom:'16px'}}>
                <Clock size={18} color="#b45309" style={{flexShrink:0, marginTop:2}}/>
                <div>
                  <p style={{margin:0, fontSize:'0.875rem', fontWeight:600, color:'#92400e'}}>Case saved on this device</p>
                  <p style={{margin:'2px 0 0', fontSize:'0.8rem', color:'#92400e'}}>
                    No connection right now — it will be sent to the server automatically once you're back online.
                    Referral, transport, and consultation can be set up for it after that.
                  </p>
                </div>
              </div>
              <button onClick={handleClose} style={{width:'100%', padding:'11px', background:'#207652', color:'white', border:'none', borderRadius:'8px', fontSize:'0.875rem', fontWeight:500, cursor:'pointer'}}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Cases List Page ───────────────────────────────────────────────────────────
export default function CasesPage() {
  const { isHealthWorker, isFacilityAdmin, isSuperAdmin } = useAuth()
  const [cases, setCases]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const { pending, syncVersion } = useOfflineQueue()

  const queuedCases = pending
    .filter(item => item.meta?.kind === QueueKinds.CASE_CREATE)
    .map(item => ({
      id: `queued:${item.id}`,
      __queued: true,
      __failed: isQueueItemFailed(item),
      patient_name: item.data.patient_name,
      patient_age: item.data.patient_age,
      gestational_age_weeks: item.data.gestational_age_weeks,
      danger_signs: item.data.danger_signs || [],
      created_by_name: null,
      referring_facility_name: null,
      created_at: item.createdAt,
    }))

  const load = () => {
    casesApi.list()
      .then(({ data }) => setCases(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  // A queued case disappears from `pending` the instant it syncs — refetch
  // immediately so the real record replaces it without a visible gap.
  useEffect(() => { if (syncVersion > 0) load() }, [syncVersion])

  if (loading) return <PageSpinner />

  const canCreate = isHealthWorker || isSuperAdmin
  const listData = [...queuedCases, ...cases]

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Emergency Cases</h1>
          <p className="text-slate-500 text-sm mt-1">{cases.length} case{cases.length!==1?'s':''}</p>
        </div>
        {canCreate && <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16}/> New Case</button>}
      </div>

      {listData.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No cases yet" description="Create a new emergency case to get started"
          action={canCreate && <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16}/> New Case</button>} />
      ) : (
        <div className="card divide-y divide-slate-50">
          {queuedCases.map(c => (
            <div key={c.id} className={`flex items-start gap-4 px-5 py-4 border-l-4 ${c.__failed ? 'border-l-danger-400 bg-danger-50/30' : 'border-l-amber-400 bg-amber-50/30'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${c.__failed ? 'bg-danger-100' : 'bg-amber-100'}`}>
                {c.__failed ? <AlertOctagon size={18} className="text-danger-600"/> : <Clock size={18} className="text-amber-600"/>}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">
                    {c.patient_name || 'Patient'} · {c.patient_age}y
                    {c.gestational_age_weeks ? ` · ${c.gestational_age_weeks}wk` : ''}
                  </p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${c.__failed ? 'bg-danger-100 text-danger-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.__failed ? 'Sync failed' : 'Pending sync'}
                  </span>
                </div>
                <DangerSignList signs={c.danger_signs}/>
                <p className="text-xs text-slate-400">not yet on server · {formatDistanceToNow(new Date(c.created_at), {addSuffix:true})}</p>
              </div>
            </div>
          ))}
          {cases.map(c => (
            <Link key={c.id} to={`/app/cases/${c.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group">
              <div className="w-10 h-10 bg-danger-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-danger-600"/>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">
                    {c.patient_name || 'Patient'} · {c.patient_age}y
                    {c.gestational_age_weeks ? ` · ${c.gestational_age_weeks}wk` : ''}
                  </p>
                  {(isFacilityAdmin || isSuperAdmin) && <span className="text-xs text-slate-400">by {c.created_by_name}</span>}
                </div>
                <DangerSignList signs={c.danger_signs}/>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock size={10}/>
                  {c.referring_facility_name} · {formatDistanceToNow(new Date(c.created_at), {addSuffix:true})}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateCaseModal open={modal} onClose={() => setModal(false)} onCreated={newCase => setCases(prev => [newCase, ...prev])} />
    </div>
  )
}
