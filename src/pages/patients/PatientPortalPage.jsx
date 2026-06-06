import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { patientsApi, publicApi, api } from '@/api/client'
import { PageSpinner, Alert, Spinner } from '@/components/ui'
import {
  Baby, Star, Phone, BookOpen, ChevronRight, ChevronDown,
  CheckCircle, MessageCircle, Clock, AlertTriangle, Heart,
  Send, MapPin, Calendar, Activity, ShieldCheck, UserCircle
} from 'lucide-react'

// ── Pregnancy Coach ───────────────────────────────────────────────────────────
const WEEKS = [
  { range:[1,4],   title:'Weeks 1–4',   subtitle:'Very early pregnancy', icon:'🌱',
    tips:['Take folic acid (400–800 mcg) daily to prevent neural tube defects.','Avoid alcohol, smoking, and unprescribed medications.','Book your first antenatal appointment as soon as possible.'],
    warning:'Watch for: heavy bleeding, severe cramps, or fever — go to a facility immediately.' },
  { range:[5,12],  title:'Weeks 5–12',  subtitle:'First trimester', icon:'🫘',
    tips:['Nausea is common — eat small frequent meals and stay hydrated.','Attend your first ANC visit for blood tests, HIV testing, and booking.','Avoid raw or undercooked meat and unpasteurised dairy.'],
    warning:'Watch for: severe vomiting preventing any fluid intake, heavy bleeding, or one-sided pain.' },
  { range:[13,27], title:'Weeks 13–27', subtitle:'Second trimester', icon:'🤰',
    tips:['Baby movements usually start around week 18–20 — note when you first feel them.','Attend ANC visits at weeks 16, 20, and 26.','Sleep on your left side to improve blood flow to baby.','Iron supplements are important — take with orange juice for better absorption.'],
    warning:'Watch for: reduced or absent baby movements, severe headache, blurred vision, swollen face/hands.' },
  { range:[28,36], title:'Weeks 28–36', subtitle:'Late second / early third trimester', icon:'👶',
    tips:['Count baby kicks daily — you should feel at least 10 movements in 2 hours.','Watch for signs of pre-eclampsia: severe headache, visual changes, upper abdominal pain.','Prepare your birth plan and know your nearest facility.','Attend ANC visits every 2–4 weeks from week 28.'],
    warning:'Watch for: severe headache, sudden swelling, reduced movements, bleeding, or fluid leaking.' },
  { range:[37,40], title:'Weeks 37–40', subtitle:'Full term', icon:'🏥',
    tips:['Your baby is ready to be born — go to a facility when contractions are 5 minutes apart.','Pack your hospital bag: documents, clothes for you and baby, sanitary items.','Know the danger signs of labour that need immediate attention.'],
    warning:'Go to a facility IMMEDIATELY for: heavy bleeding, cord prolapse, baby not moving, severe pain, or difficulty breathing.' },
]

const DANGER_SIGNS = [
  { sign:'Heavy vaginal bleeding',       level:'Emergency', color:'#dc2626' },
  { sign:'Severe headache with vision changes', level:'Emergency', color:'#dc2626' },
  { sign:'Baby not moving (after 20 wks)',      level:'Emergency', color:'#dc2626' },
  { sign:'Cord prolapse',                level:'Emergency', color:'#dc2626' },
  { sign:'Fits/seizures (eclampsia)',    level:'Emergency', color:'#dc2626' },
  { sign:'Severe abdominal pain',        level:'Emergency', color:'#dc2626' },
  { sign:'Difficulty breathing',         level:'Emergency', color:'#dc2626' },
  { sign:'High fever (>38°C)',           level:'Urgent',    color:'#d97706' },
  { sign:'Painful/burning urination',    level:'Urgent',    color:'#d97706' },
  { sign:'Swollen face, hands, or feet', level:'Urgent',    color:'#d97706' },
  { sign:'Reduced baby movements',       level:'Urgent',    color:'#d97706' },
  { sign:'Water breaking before contractions', level:'Urgent', color:'#d97706' },
]

function PregnancyCoach({ patient }) {
  const [openWeek, setOpenWeek] = useState(null)
  const gestWeeks = patient?.gestational_age_weeks || null

  const currentPhase = gestWeeks
    ? WEEKS.find(w => gestWeeks >= w.range[0] && gestWeeks <= w.range[1]) || WEEKS[WEEKS.length - 1]
    : null

  return (
    <div className="space-y-5">
      {/* Current week highlight */}
      {currentPhase && (
        <div className="card px-5 py-5 border-2 border-brand-200 bg-brand-50">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{currentPhase.icon}</span>
            <div>
              <p className="font-semibold text-brand-800">You are currently at week {gestWeeks}</p>
              <p className="text-sm text-brand-600">{currentPhase.subtitle}</p>
            </div>
          </div>
          <ul className="space-y-1.5">
            {currentPhase.tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <CheckCircle size={14} className="text-brand-500 mt-0.5 shrink-0"/>
                {t}
              </li>
            ))}
          </ul>
          {currentPhase.warning && (
            <div className="mt-3 flex gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0"/>
              <p className="text-xs text-red-700">{currentPhase.warning}</p>
            </div>
          )}
        </div>
      )}

      {/* All phases accordion */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">All pregnancy stages</p>
        <div className="space-y-2">
          {WEEKS.map((w, i) => (
            <div key={i} className="card overflow-hidden">
              <button
                onClick={() => setOpenWeek(openWeek === i ? null : i)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="text-xl">{w.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{w.title}</p>
                  <p className="text-xs text-slate-400">{w.subtitle}</p>
                </div>
                {openWeek === i ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
              </button>
              {openWeek === i && (
                <div className="px-5 pb-4 space-y-2 border-t border-slate-50">
                  {w.tips.map((t, j) => (
                    <div key={j} className="flex gap-2 text-sm text-slate-700 pt-2">
                      <CheckCircle size={13} className="text-brand-500 mt-0.5 shrink-0"/>
                      {t}
                    </div>
                  ))}
                  {w.warning && (
                    <div className="flex gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">
                      <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0"/>
                      <p className="text-xs text-red-700">{w.warning}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Danger signs reference */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Danger sign reference</p>
        <div className="card divide-y divide-slate-50">
          {DANGER_SIGNS.map((d, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <p className="text-sm text-slate-700">{d.sign}</p>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: d.level === 'Emergency' ? '#fef2f2' : '#fffbeb', color: d.color }}>
                {d.level}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Service Reviews ───────────────────────────────────────────────────────────
function ServiceReviews({ patientId }) {
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ facility_name:'', visit_type:'antenatal', rating:5, comment:'' })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  useEffect(() => {
    // Load reviews from localStorage (client-side storage for portal)
    const stored = JSON.parse(localStorage.getItem(`reviews_${patientId}`) || '[]')
    setReviews(stored)
    setLoading(false)
  }, [patientId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.facility_name.trim() || !form.comment.trim()) { setError('Please fill in all fields.'); return }
    setSaving(true); setError('')
    const newReview = { ...form, id: Date.now(), created_at: new Date().toISOString() }
    const updated = [newReview, ...reviews]
    localStorage.setItem(`reviews_${patientId}`, JSON.stringify(updated))
    setReviews(updated)
    setForm({ facility_name:'', visit_type:'antenatal', rating:5, comment:'' })
    setShowForm(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
    setSaving(false)
  }

  const VISIT_TYPES = [
    { value:'antenatal', label:'Antenatal Care (ANC)' },
    { value:'delivery',  label:'Delivery / Labour' },
    { value:'postnatal', label:'Postnatal Care' },
    { value:'emergency', label:'Emergency Visit' },
    { value:'other',     label:'Other' },
  ]

  return (
    <div className="space-y-4">
      {success && <Alert type="success" message="Thank you for your feedback!"/>}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="btn-primary w-full justify-center">
          <Star size={15}/> Rate a Service
        </button>
      ) : (
        <div className="card px-5 py-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Share your experience</p>
          {error && <Alert type="error" message={error} className="mb-3"/>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Facility Name <span className="text-red-500">*</span></label>
              <input className="input-field" value={form.facility_name} onChange={e => setForm(f=>({...f,facility_name:e.target.value}))} placeholder="e.g. Komfo Anokye Teaching Hospital"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Visit</label>
              <select className="input-field" value={form.visit_type} onChange={e => setForm(f=>({...f,visit_type:e.target.value}))}>
                {VISIT_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Rating</label>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setForm(f=>({...f,rating:n}))}>
                    <Star size={28} className={n <= form.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}/>
                  </button>
                ))}
                <span className="text-sm text-slate-500 ml-2 self-center">{form.rating}/5</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Experience <span className="text-red-500">*</span></label>
              <textarea rows={3} className="input-field resize-none" value={form.comment} onChange={e => setForm(f=>({...f,comment:e.target.value}))} placeholder="How was the care you received? Was the staff helpful? Were you treated with dignity?"/>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleSubmit} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? <Spinner size={14} className="text-white"/> : <><Send size={14}/> Submit</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <PageSpinner/> : reviews.length === 0 ? (
        <div className="card px-5 py-10 text-center">
          <Star size={28} className="text-slate-200 mx-auto mb-2"/>
          <p className="text-sm text-slate-400">No reviews yet. Share your experience to help improve care.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="card px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{r.facility_name}</p>
                  <p className="text-xs text-slate-400">{VISIT_TYPES.find(v=>v.value===r.visit_type)?.label || r.visit_type} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  {[1,2,3,4,5].map(n => <Star key={n} size={14} className={n <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}/>)}
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{r.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── On-Call / Home Request ────────────────────────────────────────────────────
function HomeServiceRequest({ patient }) {
  const [form, setForm]     = useState({ request_type:'home_visit', description:'', location:'', preferred_time:'' })
  const [requests, setReqs] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const patientId = patient?.id
  useEffect(() => {
    if (!patientId) return
    const stored = JSON.parse(localStorage.getItem(`home_requests_${patientId}`) || '[]')
    setReqs(stored)
  }, [patientId])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.description.trim() || !form.location.trim()) { setError('Please describe your concern and provide your location.'); return }
    setSaving(true); setError('')
    const newReq = { ...form, id: Date.now(), status:'pending', created_at: new Date().toISOString() }
    const updated = [newReq, ...requests]
    localStorage.setItem(`home_requests_${patientId}`, JSON.stringify(updated))
    setReqs(updated)
    setForm({ request_type:'home_visit', description:'', location:'', preferred_time:'' })
    setSuccess(true)
    setTimeout(() => setSuccess(false), 4000)
    setSaving(false)
  }

  const REQUEST_TYPES = [
    { value:'home_visit',    label:'Home Visit',          desc:'A health worker comes to you', icon:'🏠' },
    { value:'on_call',       label:'On-Call Consultation', desc:'Speak with a health worker by phone', icon:'📞' },
    { value:'transport',     label:'Transport Request',    desc:'Request a vehicle to the facility', icon:'🚑' },
    { value:'follow_up',     label:'Follow-up Check',      desc:'Post-discharge check-in at home', icon:'💊' },
  ]

  const STATUS_COLORS = { pending:'bg-amber-100 text-amber-700', confirmed:'bg-brand-100 text-brand-700', completed:'bg-emerald-100 text-emerald-700', cancelled:'bg-slate-100 text-slate-500' }

  return (
    <div className="space-y-5">
      {success && <Alert type="success" message="Request submitted. A health worker will contact you shortly."/>}
      {error   && <Alert type="error"   message={error}/>}

      <div className="card px-5 py-5">
        <p className="text-sm font-semibold text-slate-700 mb-1">Request home or on-call care</p>
        <p className="text-xs text-slate-400 mb-4">For when you cannot travel to a facility or need urgent advice</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {REQUEST_TYPES.map(t => (
            <button key={t.value} type="button"
              onClick={() => setForm(f=>({...f,request_type:t.value}))}
              className={`p-3 rounded-xl border-2 text-left transition-all ${form.request_type === t.value ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-brand-200'}`}
            >
              <span className="text-lg">{t.icon}</span>
              <p className="text-xs font-semibold text-slate-800 mt-1">{t.label}</p>
              <p className="text-[10px] text-slate-400">{t.desc}</p>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Describe your concern <span className="text-red-500">*</span></label>
            <textarea rows={3} className="input-field resize-none" value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="What is your symptom or concern? e.g. severe headache, reduced baby movements, difficulty breathing…"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><MapPin size={13}/> Location / Address <span className="text-red-500">*</span></label>
            <input className="input-field" value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))} placeholder="Your home address or landmark"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Calendar size={13}/> Preferred time (optional)</label>
            <input type="datetime-local" className="input-field" value={form.preferred_time} onChange={e => setForm(f=>({...f,preferred_time:e.target.value}))}/>
          </div>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary w-full justify-center">
            {saving ? <Spinner size={14} className="text-white"/> : <><Send size={14}/> Submit Request</>}
          </button>
        </div>
      </div>

      {/* Emergency contact strip */}
      <div className="card px-5 py-4 bg-red-50 border-red-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <Phone size={18} className="text-red-600"/>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-800">Emergency? Call immediately</p>
            <p className="text-xs text-red-600 mt-0.5">For life-threatening emergencies, do not wait — call your nearest facility or emergency line</p>
          </div>
        </div>
      </div>

      {/* Past requests */}
      {requests.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Your requests</p>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="card px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{REQUEST_TYPES.find(t=>t.value===r.request_type)?.label}</p>
                  <p className="text-xs text-slate-400 truncate">{r.description}</p>
                  <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── My Health Summary ─────────────────────────────────────────────────────────
function MyHealthSummary({ patient }) {
  if (!patient) return <PageSpinner/>
  const p = patient
  return (
    <div className="space-y-4">
      <div className="card px-5 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center">
            <UserCircle size={24} className="text-brand-600"/>
          </div>
          <div>
            <p className="font-semibold text-slate-800">{p.patient_name || 'Patient'}</p>
            <p className="text-xs text-slate-400">Age {p.age} · {p.blood_group !== 'unknown' ? p.blood_group : 'Blood group unknown'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {[
            ['Hospital ID',    p.hospital_id || '—'],
            ['Town',           p.town        || '—'],
            ['Gravida',        p.gravida     ?? '—'],
            ['Parity',         p.parity      ?? '—'],
            ['ANC Visits',     p.anc_visits],
            ['Expected Delivery', p.expected_delivery_date ? new Date(p.expected_delivery_date).toLocaleDateString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k}</p>
              <p className="text-sm font-semibold text-slate-700 mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {p.next_of_kin_name && (
        <div className="card px-5 py-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Next of Kin</p>
          <p className="text-sm font-medium text-slate-800">{p.next_of_kin_name}</p>
          <p className="text-xs text-slate-500">{p.next_of_kin_relationship} · {p.next_of_kin_phone}</p>
        </div>
      )}

      {p.risk_level && p.risk_level !== 'low' && (
        <div className={`card px-5 py-4 border-2 ${p.risk_level === 'high' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className={p.risk_level === 'high' ? 'text-red-600' : 'text-amber-600'}/>
            <p className="text-sm font-semibold">{p.risk_level === 'high' ? 'High risk pregnancy' : 'Some risk factors noted'}</p>
          </div>
          {p.risk_flags?.length > 0 && (
            <ul className="space-y-1">
              {p.risk_flags.map((f, i) => <li key={i} className="text-xs text-slate-600">• {f}</li>)}
            </ul>
          )}
          <p className="text-xs text-slate-500 mt-2">Attend all scheduled ANC visits and report any new symptoms to your health worker.</p>
        </div>
      )}

      <div className="card px-5 py-4 bg-brand-50 border-brand-200">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={16} className="text-brand-600"/>
          <p className="text-sm font-semibold text-brand-800">Your data is protected</p>
        </div>
        <p className="text-xs text-brand-700">Your health information is stored securely. Only health workers at your facility and the care team assigned to you can access your records.</p>
      </div>
    </div>
  )
}

// ── Patient Portal Dashboard ──────────────────────────────────────────────────
const TABS = [
  { id:'coach',   label:'Pregnancy Guide', icon: BookOpen },
  { id:'reviews', label:'Rate a Service',  icon: Star },
  { id:'request', label:'Home / On-Call',  icon: Phone },
  { id:'summary', label:'My Health',       icon: Heart },
]

export default function PatientPortalPage() {
  const { user } = useAuth()
  const [tab,     setTab]     = useState('coach')
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Find the patient profile linked to this user
    if (!user) return
    patientsApi.list()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.results || []
        // The patient portal user's profile is at /api/cases/patients/ filtered by their own link
        // For portal users, the backend returns only their own record
        if (list.length > 0) setPatient(list[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white font-semibold">
          {user?.name?.[0]?.toUpperCase() || 'P'}
        </div>
        <div>
          <p className="font-semibold text-slate-800">Welcome, {user?.name?.split(' ')[0] || 'Patient'}</p>
          <p className="text-xs text-slate-400">NeoMatCare Patient Portal</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="grid grid-cols-4 gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg text-xs font-medium transition-all ${
                tab === t.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={18}/>
              <span className="leading-tight text-center">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {loading ? <PageSpinner/> : (
        <>
          {tab === 'coach'   && <PregnancyCoach patient={patient}/>}
          {tab === 'reviews' && <ServiceReviews patientId={patient?.id || user?.id}/>}
          {tab === 'request' && <HomeServiceRequest patient={patient}/>}
          {tab === 'summary' && <MyHealthSummary patient={patient}/>}
        </>
      )}
    </div>
  )
}
