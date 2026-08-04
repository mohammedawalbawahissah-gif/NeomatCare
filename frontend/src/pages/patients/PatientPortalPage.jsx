import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { patientApi, transportApi, wellnessApi, householdsApi } from '@/api/client'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'
import {
  Baby, Star, PhoneCall, Truck, HeartPulse,
  ChevronDown, ChevronUp, Send, Plus, AlertTriangle,
  CheckCircle, Clock, MapPin, Calendar, Phone,
  User, Mail, Shield, RotateCcw, Droplet, Sparkles, Home,
} from 'lucide-react'

// ── Shared styles ─────────────────────────────────────────────────────────────
const card  = { background:'white', borderRadius:'14px', padding:'1.5rem', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginBottom:'1rem' }
const btn   = (color='#207652') => ({ display:'inline-flex', alignItems:'center', gap:'6px', padding:'10px 18px', background:color, color:'white', border:'none', borderRadius:'8px', fontSize:'0.875rem', fontWeight:600, cursor:'pointer' })
const input = { width:'100%', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', boxSizing:'border-box', background:'white' }
const label = { display:'block', fontSize:'0.8rem', fontWeight:500, color:'#374151', marginBottom:'4px' }

// ── 1. Pregnancy Guide ────────────────────────────────────────────────────────
const TRIMESTERS = [
  {
    title: 'First Trimester (Weeks 1–12)',
    color: '#dcfce7',
    border: '#86efac',
    accent: '#166534',
    tips: [
      'Attend your first antenatal care (ANC) visit as early as possible.',
      'Start folic acid supplements (400 mcg/day) to prevent neural tube defects.',
      'Avoid alcohol, tobacco, and unprescribed medications.',
      'Eat small, frequent meals to manage nausea.',
      'Stay hydrated — aim for 8–10 glasses of water daily.',
      'Rest as much as possible; fatigue is normal.',
    ],
    danger: [
      'Heavy vaginal bleeding',
      'Severe abdominal cramps',
      'High fever (above 38°C)',
      'Fainting or loss of consciousness',
    ],
  },
  {
    title: 'Second Trimester (Weeks 13–27)',
    color: '#fef9c3',
    border: '#fde047',
    accent: '#713f12',
    tips: [
      'Continue ANC visits — typically monthly during this period.',
      'Sleep on your left side to improve blood flow to baby.',
      'Eat iron-rich foods (beans, dark greens, lean meat) to prevent anaemia.',
      'Take iron and folate supplements as prescribed.',
      'Start monitoring baby movements after week 20.',
      'Avoid standing for long periods without rest.',
    ],
    danger: [
      'No foetal movement felt after week 20',
      'Sudden swelling of face, hands, or feet',
      'Severe headache or blurred vision',
      'Vaginal bleeding of any amount',
      'Pain or burning when urinating',
    ],
  },
  {
    title: 'Third Trimester (Weeks 28–40+)',
    color: '#fce7f3',
    border: '#f9a8d4',
    accent: '#831843',
    tips: [
      'Increase ANC visit frequency — every two weeks after week 28, weekly from week 36.',
      'Count baby kicks daily — at least 10 movements in 2 hours.',
      'Prepare your delivery bag early (week 35–36).',
      'Discuss your birth plan with your health worker.',
      'Watch for signs of pre-eclampsia (headache, visual changes, upper-belly pain).',
      'Arrange transport to the facility in advance.',
    ],
    danger: [
      'Decreased or absent foetal movement',
      'Severe or sudden headache',
      'Blurred or double vision',
      'Swelling of face and hands',
      'Fluid gushing from vagina (ruptured membranes)',
      'Contractions before 37 weeks',
      'Heavy bleeding',
    ],
  },
]

function PregnancyTab() {
  const [snapshot, setSnapshot] = useState(null)
  const [reason, setReason] = useState(null) // 'no_patient_record' | 'no_edd' | null
  const [loading, setLoading] = useState(true)
  const [lmpInput, setLmpInput] = useState('')
  const [submittingEdd, setSubmittingEdd] = useState(false)
  const [showFullReference, setShowFullReference] = useState(false)

  const load = () => {
    setLoading(true)
    wellnessApi.myPregnancy()
      .then(({ data }) => { setSnapshot(data); setReason(null) })
      .catch((err) => {
        setSnapshot(null)
        setReason(err?.response?.data?.reason || 'no_edd')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSetEdd = async (e) => {
    e.preventDefault()
    if (!lmpInput) return
    setSubmittingEdd(true)
    try {
      await wellnessApi.setEdd({ last_period_start: lmpInput })
      load()
    } finally {
      setSubmittingEdd(false)
    }
  }

  return (
    <div>
      <div style={{ ...card, background:'linear-gradient(135deg,#f0fdf4,#dcfce7)', border:'1px solid #86efac' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
          <Baby size={22} color="#166534" />
          <h3 style={{ margin:0, color:'#166534', fontSize:'1rem', fontWeight:700 }}>Pregnancy Tracker</h3>
        </div>
        <p style={{ margin:0, fontSize:'0.875rem', color:'#14532d' }}>
          Personalized nutrition, lifestyle, and danger-sign guidance for exactly where you are today.
          If you notice any danger sign below, go to your nearest health facility or use the Transport tab.
        </p>
      </div>

      {loading && <p style={{ fontSize:'0.85rem', color:'#94a3b8', textAlign:'center', padding:'1rem' }}>Loading…</p>}

      {!loading && !snapshot && reason === 'no_patient_record' && (
        <div style={{ ...card, background:'#f8fafc', border:'1px dashed #cbd5e1', textAlign:'center' }}>
          <p style={{ margin:0, fontSize:'0.85rem', color:'#64748b' }}>
            Your tracker will appear here once a health worker registers your patient record.
          </p>
        </div>
      )}

      {!loading && !snapshot && reason === 'no_edd' && (
        <div style={{ ...card, border:'1.5px solid #a5b4fc', background:'linear-gradient(135deg,#eef2ff,#e0e7ff)' }}>
          <p style={{ margin:'0 0 10px', fontWeight:700, fontSize:'0.9rem', color:'#3730a3' }}>
            Let's set up your tracker
          </p>
          <p style={{ margin:'0 0 12px', fontSize:'0.82rem', color:'#4338ca' }}>
            Enter the start date of your last period and we'll estimate your due date and current week.
            This is your own estimate — your health worker's clinical date will always take priority once recorded.
          </p>
          <form onSubmit={handleSetEdd} style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <input type="date" style={{ ...input, flex:'1 1 180px' }} value={lmpInput}
              onChange={e => setLmpInput(e.target.value)} required />
            <button type="submit" disabled={submittingEdd} style={btn('#4338ca')}>
              {submittingEdd ? 'Saving…' : 'Set up tracker'}
            </button>
          </form>
        </div>
      )}

      {!loading && snapshot && (
        <>
          {/* Today */}
          <div style={{ ...card, border:'1.5px solid #86efac' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
              <span style={{ fontWeight:700, fontSize:'0.9rem', color:'#166534' }}>Today — Week {snapshot.current_week}</span>
              <span style={{ fontSize:'0.75rem', color:'#64748b' }}>{snapshot.days_remaining} days until due date</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <p style={{ margin:0, fontSize:'0.85rem', color:'#166534' }}>🥗 <strong>Nutrition:</strong> {snapshot.daily_content.nutrition_tip}</p>
              <p style={{ margin:0, fontSize:'0.85rem', color:'#166534' }}>🧘 <strong>Lifestyle:</strong> {snapshot.daily_content.lifestyle_tip}</p>
              <p style={{ margin:0, fontSize:'0.85rem', color:'#b91c1c' }}>⚠️ <strong>Watch for:</strong> {snapshot.daily_content.danger_sign_reminder}</p>
            </div>
          </div>

          {/* This week */}
          <div style={card}>
            <p style={{ margin:'0 0 8px', fontWeight:700, fontSize:'0.9rem', color:'#374151' }}>This Week</p>
            {snapshot.weekly_content.milestone && (
              <p style={{ margin:'0 0 8px', fontSize:'0.8rem', color:'#64748b', fontStyle:'italic' }}>{snapshot.weekly_content.milestone}</p>
            )}
            <p style={{ margin:'0 0 4px', fontSize:'0.82rem', fontWeight:600, color:'#166534' }}>Nutrition</p>
            <ul style={{ margin:'0 0 8px', paddingLeft:'1.1rem' }}>
              {snapshot.weekly_content.nutrition.slice(0, 3).map((t, i) => (
                <li key={i} style={{ fontSize:'0.82rem', color:'#374151', marginBottom:'3px' }}>{t}</li>
              ))}
            </ul>
            <p style={{ margin:'0 0 4px', fontSize:'0.82rem', fontWeight:600, color:'#166534' }}>Lifestyle</p>
            <ul style={{ margin:0, paddingLeft:'1.1rem' }}>
              {snapshot.weekly_content.lifestyle.slice(0, 3).map((t, i) => (
                <li key={i} style={{ fontSize:'0.82rem', color:'#374151', marginBottom:'3px' }}>{t}</li>
              ))}
            </ul>
          </div>

          {/* This month */}
          <div style={card}>
            <p style={{ margin:'0 0 8px', fontWeight:700, fontSize:'0.9rem', color:'#374151' }}>
              This Month — Month {snapshot.current_month}
            </p>
            <p style={{ margin:0, fontSize:'0.82rem', color:'#374151' }}>
              You're in your {snapshot.monthly_content.trimester_title.toLowerCase()}. Nutrition and lifestyle
              guidance stays consistent through the month — check the Trimester section below for the full list.
            </p>
          </div>

          {/* Trimester */}
          <div style={{ ...card, border:'1.5px solid #c7d2fe' }}>
            <button onClick={() => setShowFullReference(s => !s)}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <span style={{ fontWeight:700, fontSize:'0.9rem', color:'#374151' }}>
                {snapshot.trimester_content.title} — Full Reference
              </span>
              {showFullReference ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
            </button>
            {showFullReference && (
              <div style={{ marginTop:'12px' }}>
                <p style={{ margin:'0 0 4px', fontSize:'0.82rem', fontWeight:600, color:'#166534' }}>All Nutrition Tips</p>
                <ul style={{ margin:'0 0 10px', paddingLeft:'1.1rem' }}>
                  {snapshot.trimester_content.nutrition.map((t, i) => (
                    <li key={i} style={{ fontSize:'0.82rem', color:'#374151', marginBottom:'3px' }}>{t}</li>
                  ))}
                </ul>
                <p style={{ margin:'0 0 4px', fontSize:'0.82rem', fontWeight:600, color:'#166534' }}>All Lifestyle Tips</p>
                <ul style={{ margin:'0 0 10px', paddingLeft:'1.1rem' }}>
                  {snapshot.trimester_content.lifestyle.map((t, i) => (
                    <li key={i} style={{ fontSize:'0.82rem', color:'#374151', marginBottom:'3px' }}>{t}</li>
                  ))}
                </ul>
                <div style={{ background:'#fff4f2', border:'1px solid #fca5a5', borderRadius:'10px', padding:'0.875rem 1rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
                    <AlertTriangle size={15} color="#dc2626" />
                    <span style={{ fontWeight:700, fontSize:'0.85rem', color:'#dc2626' }}>Danger Signs — Seek Help Immediately</span>
                  </div>
                  <ul style={{ margin:0, paddingLeft:'1.25rem', display:'flex', flexDirection:'column', gap:'4px' }}>
                    {snapshot.trimester_content.danger_signs.map((d, i) => (
                      <li key={i} style={{ fontSize:'0.85rem', color:'#7f1d1d' }}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CycleTrackerTab() {
  const [entries, setEntries] = useState([])
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ period_start: '', period_end: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const cycleVoiceFields = [{ key: 'notes', label: 'Notes', get: () => form.notes, set: (v) => setForm(f => ({ ...f, notes: v })) }]
  const cycleVoiceEntry = useVoiceEntry(cycleVoiceFields)

  const load = () => {
    setLoading(true)
    Promise.all([wellnessApi.listCycleEntries(), wellnessApi.cyclePrediction()])
      .then(([e, p]) => {
        setEntries(e.data.results || e.data)
        setPrediction(p.data)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.period_start) return
    setSubmitting(true)
    try {
      await wellnessApi.addCycleEntry({
        period_start: form.period_start,
        period_end: form.period_end || null,
        notes: form.notes,
      })
      setForm({ period_start: '', period_end: '', notes: '' })
      load()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ ...card, background:'linear-gradient(135deg,#fdf2f8,#fce7f3)', border:'1px solid #f9a8d4' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
          <Droplet size={22} color="#831843" />
          <h3 style={{ margin:0, color:'#831843', fontSize:'1rem', fontWeight:700 }}>Cycle Tracker</h3>
        </div>
        <p style={{ margin:0, fontSize:'0.875rem', color:'#831843' }}>
          Log your period dates to see predictions for your next cycle. This is a simple estimate based on your own history, not medical advice.
        </p>
      </div>

      {!loading && prediction && (
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <p style={{ margin:0, fontWeight:600, fontSize:'0.85rem', color:'#374151' }}>Prediction</p>
            {prediction.has_prediction && (
              <span style={{ fontSize:'0.7rem', fontWeight:600, padding:'2px 8px', borderRadius:'999px',
                background: prediction.is_estimated ? '#fef3c7' : '#dcfce7',
                color:      prediction.is_estimated ? '#92400e' : '#166534' }}>
                {prediction.is_estimated ? 'Estimated' : 'Personalized'}
              </span>
            )}
          </div>
          {prediction.has_prediction ? (
            <>
              <div style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap' }}>
                <div>
                  <p style={{ margin:0, fontSize:'1.1rem', fontWeight:700, color:'#831843' }}>
                    {new Date(prediction.predicted_next_period_start).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                  </p>
                  <p style={{ margin:0, fontSize:'0.78rem', color:'#64748b' }}>next period (est.)</p>
                </div>
                <div>
                  <p style={{ margin:0, fontSize:'1.1rem', fontWeight:700, color:'#831843' }}>{prediction.avg_cycle_length_days} days</p>
                  <p style={{ margin:0, fontSize:'0.78rem', color:'#64748b' }}>
                    {prediction.is_estimated ? 'typical cycle length assumed' : 'your average cycle length'}
                  </p>
                </div>
              </div>
              {prediction.is_estimated && (
                <p style={{ margin:'8px 0 0', fontSize:'0.78rem', color:'#94a3b8', fontStyle:'italic' }}>
                  Based on a typical 28-day cycle — log one more period and we'll personalize this to your own pattern.
                </p>
              )}
            </>
          ) : (
            <p style={{ margin:0, fontSize:'0.85rem', color:'#64748b' }}>
              Log your first period to get an estimate.
            </p>
          )}
        </div>
      )}

      <div style={card}>
        <p style={{ margin:'0 0 10px', fontWeight:600, fontSize:'0.85rem', color:'#374151' }}>Log a period</p>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <div>
            <label style={label}>Start date</label>
            <input type="date" style={input} value={form.period_start}
              onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} required />
          </div>
          <div>
            <label style={label}>End date (optional)</label>
            <input type="date" style={input} value={form.period_end}
              onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
          </div>
          <div>
            <label style={label}>Notes (optional)</label>
            <VoiceEntryTrigger onClick={cycleVoiceEntry.start} count={cycleVoiceFields.length} />
            <input type="text" style={input} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any symptoms or notes" />
          </div>
          <button type="submit" disabled={submitting} style={btn('#831843')}>
            <Plus size={15} /> {submitting ? 'Saving…' : 'Log entry'}
          </button>
        </form>
        <VoiceEntryBar voiceEntry={cycleVoiceEntry} />
      </div>

      <div style={card}>
        <p style={{ margin:'0 0 10px', fontWeight:600, fontSize:'0.85rem', color:'#374151' }}>History</p>
        {entries.length === 0 && <p style={{ margin:0, fontSize:'0.85rem', color:'#94a3b8' }}>No entries logged yet.</p>}
        {entries.map(e => (
          <div key={e.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
            <span style={{ fontSize:'0.85rem', color:'#374151' }}>
              {new Date(e.period_start).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
              {e.period_end && ` – ${new Date(e.period_end).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`}
            </span>
            {e.notes && <span style={{ fontSize:'0.78rem', color:'#94a3b8' }}>{e.notes}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 2. Service Reviews ────────────────────────────────────────────────────────
const VISIT_TYPES = [
  { value:'anc',       label:'Antenatal Care (ANC)' },
  { value:'delivery',  label:'Delivery' },
  { value:'postnatal', label:'Postnatal Visit' },
  { value:'emergency', label:'Emergency Visit' },
  { value:'transport', label:'Transport Service' },
  { value:'other',     label:'Other' },
]

function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display:'flex', gap:'4px' }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          style={{ background:'none', border:'none', cursor:'pointer', padding:'2px', fontSize:'1.5rem', color: n<=(hovered||value)?'#f59e0b':'#e2e8f0' }}>
          ★
        </button>
      ))}
    </div>
  )
}

function ReviewsTab() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({ visit_type:'anc', period:'pre_labour', facility_name:'', rating:0, comments:'' })
  const [error, setError] = useState('')
  const reviewVoiceFields = [
    { key: 'facility_name', label: 'Facility Name', get: () => form.facility_name, set: (v) => setForm(p => ({ ...p, facility_name: v })) },
    { key: 'comments', label: 'Comments', get: () => form.comments, set: (v) => setForm(p => ({ ...p, comments: v })) },
  ]
  const reviewVoiceEntry = useVoiceEntry(reviewVoiceFields)

  const load = () => {
    setLoading(true)
    patientApi.reviews.list()
      .then(({ data }) => setReviews(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    if (!form.rating) { setError('Please select a star rating.'); return }
    setSubmitting(true)
    try {
      await patientApi.reviews.create(form)
      setSuccess(true); setShowForm(false)
      setForm({ visit_type:'anc', period:'pre_labour', facility_name:'', rating:0, comments:'' })
      load()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      const d = err?.response?.data
      setError(d ? (Object.values(d)[0] || 'Failed to submit review.') : 'Failed to submit review.')
    } finally { setSubmitting(false) }
  }

  const periodLabel = p => p === 'pre_labour' ? 'Pre-Labour' : 'Post-Labour'
  const visitLabel  = v => VISIT_TYPES.find(t => t.value === v)?.label || v

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
        <h3 style={{ margin:0, fontSize:'1rem', fontWeight:700, color:'#0f172a' }}>Service Ratings & Reviews</h3>
        <button onClick={() => setShowForm(v => !v)} style={btn('#207652')}>
          <Plus size={15} />{showForm ? 'Cancel' : 'Add Review'}
        </button>
      </div>

      {success && (
        <div style={{ ...card, background:'#f0fdf4', border:'1px solid #86efac', display:'flex', alignItems:'center', gap:'8px', color:'#166534' }}>
          <CheckCircle size={18} /> Review submitted successfully!
        </div>
      )}

      {showForm && (
        <div style={card}>
          <h4 style={{ margin:'0 0 1rem', fontSize:'0.95rem', fontWeight:600, color:'#0f172a' }}>Submit a Review</h4>
          {error && <div style={{ background:'#fff4f2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'0.75rem', color:'#c02812', fontSize:'0.875rem', marginBottom:'1rem' }}>{error}</div>}
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div>
                <label style={label}>Visit Type</label>
                <select value={form.visit_type} onChange={set('visit_type')} style={input}>
                  {VISIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Period</label>
                <select value={form.period} onChange={set('period')} style={input}>
                  <option value="pre_labour">Pre-Labour</option>
                  <option value="post_labour">Post-Labour</option>
                </select>
              </div>
            </div>
            <VoiceEntryTrigger onClick={reviewVoiceEntry.start} count={reviewVoiceFields.length} />
            <div>
              <label style={label}>Facility Name <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional)</span></label>
              <input value={form.facility_name} onChange={set('facility_name')} placeholder="e.g. Tamale Teaching Hospital" style={input} />
            </div>
            <div>
              <label style={label}>Rating <span style={{ color:'#e43418' }}>*</span></label>
              <StarPicker value={form.rating} onChange={r => setForm(p => ({ ...p, rating: r }))} />
            </div>
            <div>
              <label style={label}>Comments <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional)</span></label>
              <textarea value={form.comments} onChange={set('comments')} rows={3} placeholder="Tell us about your experience…" style={{ ...input, resize:'vertical' }} />
            </div>
            <button type="submit" disabled={submitting} style={{ ...btn(), justifyContent:'center' }}>
              <Send size={15} />{submitting ? 'Submitting…' : 'Submit Review'}
            </button>
          </form>
          <VoiceEntryBar voiceEntry={reviewVoiceEntry} />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem' }}>Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div style={{ ...card, textAlign:'center', color:'#94a3b8', padding:'2.5rem' }}>
          <Star size={32} style={{ marginBottom:'0.5rem', opacity:0.4 }} />
          <p style={{ margin:0, fontSize:'0.875rem' }}>No reviews yet. Share your experience!</p>
        </div>
      ) : (
        reviews.map(r => (
          <div key={r.id} style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
              <div>
                <span style={{ fontWeight:600, fontSize:'0.875rem', color:'#0f172a' }}>{visitLabel(r.visit_type)}</span>
                <span style={{ marginLeft:'8px', fontSize:'0.75rem', background:r.period==='pre_labour'?'#dbeafe':'#fce7f3', color:r.period==='pre_labour'?'#1e40af':'#831843', borderRadius:'999px', padding:'2px 8px', fontWeight:500 }}>{periodLabel(r.period)}</span>
              </div>
              <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            <div style={{ fontSize:'1.1rem', color:'#f59e0b', letterSpacing:'2px', marginBottom:'4px' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
            {r.facility_name && <p style={{ margin:'0 0 4px', fontSize:'0.8rem', color:'#64748b' }}>📍 {r.facility_name}</p>}
            {r.comments && <p style={{ margin:0, fontSize:'0.875rem', color:'#374151' }}>{r.comments}</p>}
          </div>
        ))
      )}
    </div>
  )
}

// ── 3. On-Call / Home Service Request ────────────────────────────────────────
const SERVICE_TYPES = [
  { value:'home_visit',     label:'🏠 Home Visit',            desc:'A health worker visits you at home.' },
  { value:'phone_consult',  label:'📞 Phone Consultation',    desc:'Speak to a health worker by phone.' },
  { value:'follow_up',      label:'📋 Follow-Up Check',       desc:'Post-discharge or postnatal follow-up.' },
]

function OnCallTab() {
  const [form, setForm] = useState({ type:'home_visit', description:'', location:'', preferred_time:'' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [error, setError] = useState('')
  const voiceFields = [
    { key: 'description', label: 'Describe your situation', get: () => form.description, set: (v) => setForm(p => ({ ...p, description: v })) },
    { key: 'location', label: 'Your location / address', get: () => form.location, set: (v) => setForm(p => ({ ...p, location: v })) },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    if (!form.description.trim()) { setError('Please describe your request.'); return }
    setSubmitting(true)
    try {
      // On-call requests go in as transport notes with no vehicle assigned (pending dispatch)
      await transportApi.requests.create({
        notes: `[ON-CALL / ${form.type.toUpperCase()}]\nDescription: ${form.description}\nLocation: ${form.location || 'Not specified'}\nPreferred time: ${form.preferred_time || 'As soon as possible'}`,
        status: 'pending',
      })
      setSubmitted(true)
      setForm({ type:'home_visit', description:'', location:'', preferred_time:'' })
    } catch {
      setError('Could not submit request. Please try again.')
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      {/* Emergency strip */}
      <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:'12px', padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'10px' }}>
        <Phone size={20} color="#dc2626" />
        <div>
          <p style={{ margin:0, fontWeight:700, fontSize:'0.875rem', color:'#dc2626' }}>Emergency? Call Now</p>
          <p style={{ margin:0, fontSize:'0.8rem', color:'#991b1b' }}>Ghana Emergency: <strong>112</strong> &nbsp;|&nbsp; Ambulance: <strong>193</strong></p>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ margin:'0 0 0.25rem', fontSize:'1rem', fontWeight:700, color:'#0f172a' }}>Request a Home Service</h3>
        <p style={{ margin:'0 0 1.25rem', fontSize:'0.85rem', color:'#64748b' }}>Can't make it to the facility? Request a service at home.</p>

        {submitted && (
          <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'8px', padding:'0.875rem', display:'flex', alignItems:'center', gap:'8px', color:'#166534', marginBottom:'1rem', fontSize:'0.875rem' }}>
            <CheckCircle size={17} /> Request submitted! A health worker will follow up shortly.
          </div>
        )}
        {error && <div style={{ background:'#fff4f2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'0.75rem', color:'#c02812', fontSize:'0.875rem', marginBottom:'1rem' }}>{error}</div>}

        {/* Service type cards */}
        <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'1rem' }}>
          {SERVICE_TYPES.map(s => (
            <button key={s.value} type="button"
              onClick={() => setForm(p => ({ ...p, type: s.value }))}
              style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', border:`2px solid ${form.type===s.value?'#2f9466':'#e2e8f0'}`, borderRadius:'10px', background:form.type===s.value?'#f0fdf4':'white', cursor:'pointer', textAlign:'left' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:'0.875rem', color:form.type===s.value?'#166534':'#0f172a' }}>{s.label}</div>
                <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'2px' }}>{s.desc}</div>
              </div>
              {form.type===s.value && <CheckCircle size={17} color="#207652" />}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
          <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
          <div>
            <label style={label}>Describe your situation <span style={{ color:'#e43418' }}>*</span></label>
            <textarea required value={form.description} onChange={set('description')} rows={3}
              placeholder="e.g. I am 36 weeks pregnant and having severe headaches. I cannot travel."
              style={{ ...input, resize:'vertical' }} />
          </div>
          <div>
            <label style={label}>Your location / address <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional)</span></label>
            <div style={{ position:'relative' }}>
              <MapPin size={15} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
              <input value={form.location} onChange={set('location')} placeholder="e.g. Tamale, Choggu area, near the mosque" style={{ ...input, paddingLeft:'32px' }} />
            </div>
          </div>
          <div>
            <label style={label}>Preferred time <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional)</span></label>
            <div style={{ position:'relative' }}>
              <Calendar size={15} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
              <input type="datetime-local" value={form.preferred_time} onChange={set('preferred_time')} style={{ ...input, paddingLeft:'32px' }} />
            </div>
          </div>
          <button type="submit" disabled={submitting} style={{ ...btn(), justifyContent:'center' }}>
            <Send size={15} />{submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
        <VoiceEntryBar voiceEntry={voiceEntry} />
      </div>
    </div>
  )
}

// ── 4. Transport Request ──────────────────────────────────────────────────────
const EMERGENCY_TYPES = [
  'Labour / Active contractions',
  'Heavy bleeding',
  'Difficulty breathing',
  'Severe headache or blurred vision',
  'Baby not moving',
  'Other emergency',
]

function TransportTab() {
  const [vehicles,   setVehicles]   = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [form, setForm] = useState({ vehicle:'', emergency_type:'Labour / Active contractions', notes:'', pickup_address:'' })
  const [submitting, setSubmitting] = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [error,      setError]      = useState('')
  const voiceFields = [
    { key: 'pickup_address', label: 'Your pickup address', get: () => form.pickup_address, set: (v) => setForm(p => ({ ...p, pickup_address: v })) },
    { key: 'notes', label: 'Additional notes', get: () => form.notes, set: (v) => setForm(p => ({ ...p, notes: v })) },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const load = () => {
    setLoading(true)
    Promise.all([
      transportApi.vehicles.available().then(({ data }) => setVehicles(data)).catch(() => {}),
      transportApi.requests.mine().then(({ data }) => setMyRequests(Array.isArray(data) ? data : (data.results || []))).catch(() => {}),
    ]).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    setSubmitting(true)
    try {
      const payload = {
        notes: `[PATIENT EMERGENCY TRANSPORT]\nType: ${form.emergency_type}\nPickup: ${form.pickup_address || 'Not specified'}\nNotes: ${form.notes}`,
        status: 'pending',
        ...(form.vehicle && { vehicle: form.vehicle }),
      }
      await transportApi.requests.create(payload)
      setSuccess(true); setForm({ vehicle:'', emergency_type:'Labour / Active contractions', notes:'', pickup_address:'' })
      load()
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('Could not submit transport request. Please try again or call 193.') }
    finally { setSubmitting(false) }
  }

  const statusColor = s => ({ pending:'#f59e0b', assigned:'#3b82f6', completed:'#22c55e', cancelled:'#ef4444' }[s] || '#94a3b8')

  return (
    <div>
      {/* Emergency strip */}
      <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:'12px', padding:'1rem 1.25rem', marginBottom:'1rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
          <AlertTriangle size={18} color="#dc2626" />
          <span style={{ fontWeight:700, fontSize:'0.875rem', color:'#dc2626' }}>Life-threatening emergency?</span>
        </div>
        <p style={{ margin:0, fontSize:'0.8rem', color:'#7f1d1d' }}>
          Call Ghana Ambulance: <strong>193</strong> or National Emergency: <strong>112</strong> immediately.
          Use this form for urgent-but-stable transport requests.
        </p>
      </div>

      {/* Request form */}
      <div style={card}>
        <h3 style={{ margin:'0 0 0.25rem', fontSize:'1rem', fontWeight:700, color:'#0f172a' }}>Request Emergency Transport</h3>
        <p style={{ margin:'0 0 1.25rem', fontSize:'0.85rem', color:'#64748b' }}>Can't get to the hospital? Request a vehicle to your location.</p>

        {success && (
          <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'8px', padding:'0.875rem', display:'flex', alignItems:'center', gap:'8px', color:'#166534', marginBottom:'1rem', fontSize:'0.875rem' }}>
            <CheckCircle size={17} /> Transport requested! A driver will be assigned shortly.
          </div>
        )}
        {error && <div style={{ background:'#fff4f2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'0.75rem', color:'#c02812', fontSize:'0.875rem', marginBottom:'1rem' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
          <div>
            <label style={label}>Emergency type <span style={{ color:'#e43418' }}>*</span></label>
            <select required value={form.emergency_type} onChange={set('emergency_type')} style={input}>
              {EMERGENCY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Your pickup address <span style={{ color:'#e43418' }}>*</span></label>
            <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
            <div style={{ position:'relative' }}>
              <MapPin size={15} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
              <input required value={form.pickup_address} onChange={set('pickup_address')} placeholder="e.g. Tamale, Choggu Yapala, near water tank" style={{ ...input, paddingLeft:'32px' }} />
            </div>
          </div>

          {/* Available vehicles */}
          {!loading && vehicles.length > 0 && (
            <div>
              <label style={label}>Preferred vehicle <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional — system will assign if none selected)</span></label>
              <select value={form.vehicle} onChange={set('vehicle')} style={input}>
                <option value="">— Let system assign —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.vehicle_type} · {v.registration}{v.driver_name ? ` · ${v.driver_name}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={label}>Additional notes <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional)</span></label>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              placeholder="e.g. I am alone, gate is blue, call on arrival"
              style={{ ...input, resize:'vertical' }} />
          </div>

          <button type="submit" disabled={submitting}
            style={{ ...btn('#dc2626'), justifyContent:'center', padding:'12px' }}>
            <Truck size={16} />{submitting ? 'Sending request…' : 'Request Transport Now'}
          </button>
        </form>
        <VoiceEntryBar voiceEntry={voiceEntry} />
      </div>

      {/* My requests */}
      <h4 style={{ margin:'1.25rem 0 0.75rem', fontSize:'0.9rem', fontWeight:700, color:'#374151', display:'flex', alignItems:'center', gap:'6px' }}>
        <Clock size={15} /> My Transport Requests
        <button onClick={load} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><RotateCcw size={14} /></button>
      </h4>

      {loading ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#94a3b8', fontSize:'0.875rem' }}>Loading…</div>
      ) : myRequests.length === 0 ? (
        <div style={{ ...card, textAlign:'center', color:'#94a3b8', padding:'2rem' }}>
          <Truck size={28} style={{ marginBottom:'0.5rem', opacity:0.35 }} />
          <p style={{ margin:0, fontSize:'0.875rem' }}>No transport requests yet.</p>
        </div>
      ) : (
        myRequests.slice(0, 5).map(r => (
          <div key={r.id} style={{ ...card, padding:'1rem 1.25rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
              <span style={{ fontSize:'0.8rem', fontWeight:600, color:'#0f172a' }}>
                {r.vehicle_registration || 'Vehicle TBA'}
              </span>
              <span style={{ fontSize:'0.75rem', fontWeight:700, color: statusColor(r.status), textTransform:'capitalize' }}>
                ● {r.status}
              </span>
            </div>
            {r.notes && <p style={{ margin:0, fontSize:'0.78rem', color:'#64748b', whiteSpace:'pre-wrap' }}>{r.notes.split('\n')[0]}</p>}
            <p style={{ margin:'4px 0 0', fontSize:'0.72rem', color:'#94a3b8' }}>{new Date(r.created_at).toLocaleString()}</p>
          </div>
        ))
      )}
    </div>
  )
}

// ── 5. My Health ──────────────────────────────────────────────────────────────
function MyHealthTab() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    patientApi.me()
      .then(({ data }) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const info = profile || user

  if (loading) return <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem' }}>Loading…</div>

  return (
    <div>
      {/* Profile card */}
      <div style={{ ...card, background:'linear-gradient(135deg,#f0fdf4,#dcfce7)', border:'1px solid #86efac' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'14px', marginBottom:'1rem' }}>
          <div style={{ width:'52px', height:'52px', borderRadius:'50%', background:'#207652', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1.2rem', flexShrink:0 }}>
            {info?.name?.[0]?.toUpperCase() || 'P'}
          </div>
          <div>
            <p style={{ margin:0, fontWeight:700, fontSize:'1rem', color:'#166534' }}>{info?.name}</p>
            <p style={{ margin:0, fontSize:'0.8rem', color:'#15803d' }}>Patient Account</p>
            {info?.is_verified && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.72rem', background:'#dcfce7', color:'#166534', padding:'2px 8px', borderRadius:'999px', fontWeight:600, marginTop:'2px' }}>
                <CheckCircle size={11} /> Verified
              </span>
            )}
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {[
            { icon:<Mail size={14} />,    label:'Email',  value: info?.email },
            { icon:<Phone size={14} />,   label:'Phone',  value: info?.phone_number || 'Not provided' },
            { icon:<Shield size={14} />,  label:'Role',   value: 'Patient' },
            { icon:<Calendar size={14} />,label:'Joined', value: info?.created_at ? new Date(info.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) : '—' },
          ].map(({ icon, label: lbl, value }) => (
            <div key={lbl} style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'0.875rem' }}>
              <span style={{ color:'#64748b', flexShrink:0 }}>{icon}</span>
              <span style={{ color:'#64748b', minWidth:'52px' }}>{lbl}:</span>
              <span style={{ color:'#0f172a', fontWeight:500 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy notice */}
      <div style={{ ...card, background:'#f8fafc', border:'1px solid #e2e8f0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
          <Shield size={16} color="#64748b" />
          <span style={{ fontWeight:600, fontSize:'0.875rem', color:'#374151' }}>Your Data &amp; Privacy</span>
        </div>
        <p style={{ margin:0, fontSize:'0.82rem', color:'#64748b', lineHeight:'1.6' }}>
          Your information is stored securely and used only to provide maternal care services.
          It is never shared with third parties without your consent. For questions, contact your facility or the NeoMatCare team.
        </p>
      </div>

      {/* Quick tips */}
      <div style={card}>
        <h4 style={{ margin:'0 0 0.75rem', fontSize:'0.9rem', fontWeight:700, color:'#0f172a' }}>Quick Reminders</h4>
        {[
          '📅 Attend all scheduled ANC visits.',
          '💊 Take your supplements daily as prescribed.',
          '🚨 Any danger sign → go to hospital or request transport immediately.',
          '📞 Keep your phone charged and accessible.',
          '👩‍⚕️ Contact your health worker if you have any concerns.',
        ].map((tip, i) => (
          <p key={i} style={{ margin:'0 0 6px', fontSize:'0.875rem', color:'#374151' }}>{tip}</p>
        ))}
      </div>
    </div>
  )
}

// ── 7. My Household (plain member list — no risk ranking shown to a caregiver) ─
function HouseholdTab() {
  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    householdsApi.list()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.results || []
        setHousehold(list[0] || null)
      })
      .catch(() => setError('Failed to load your household.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem' }}>Loading…</div>

  if (error) {
    return <div style={{ ...card, textAlign:'center', color:'#dc2626' }}>{error}</div>
  }

  if (!household) {
    return (
      <div style={{ ...card, textAlign:'center' }}>
        <Home size={28} color="#94a3b8" style={{ marginBottom:'8px' }} />
        <p style={{ margin:0, fontSize:'0.9rem', color:'#64748b' }}>
          You're not linked to a household record yet. Ask your health worker to add you during your next visit.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ ...card, background:'linear-gradient(135deg,#f0fdf4,#dcfce7)', border:'1px solid #86efac' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#207652', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Home size={20} color="white" />
          </div>
          <div>
            <p style={{ margin:0, fontWeight:700, fontSize:'1rem', color:'#166534' }}>{household.head_name || 'Your household'}</p>
            <p style={{ margin:0, fontSize:'0.8rem', color:'#15803d' }}>{household.town || 'Unknown town'}</p>
          </div>
        </div>
      </div>

      <div style={card}>
        <h4 style={{ margin:'0 0 0.75rem', fontSize:'0.9rem', fontWeight:700, color:'#0f172a' }}>Household Members</h4>
        {(household.members || []).length === 0 ? (
          <p style={{ margin:0, fontSize:'0.85rem', color:'#94a3b8' }}>No members registered yet.</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {household.members.map(m => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                <User size={16} color="#64748b" />
                <div>
                  <p style={{ margin:0, fontSize:'0.875rem', fontWeight:500, color:'#0f172a' }}>{m.patient_name}</p>
                  <p style={{ margin:0, fontSize:'0.78rem', color:'#94a3b8', textTransform:'capitalize' }}>{m.patient_type} · Age {m.age}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 8. Nutrition (self-serve — same household, no risk ranking) ────────────────
function LocalFoodBlock({ tips, aiSuggestion }) {
  if (!tips?.length) return null
  return (
    <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'10px', padding:'10px 12px', marginTop:'10px' }}>
      <p style={{ margin:'0 0 6px', fontSize:'0.8rem', fontWeight:600, color:'#92400e' }}>
        Local foods that can help
      </p>
      {aiSuggestion ? (
        <p style={{ margin:'0 0 8px', fontSize:'0.8rem', color:'#78350f', lineHeight:1.5 }}>{aiSuggestion}</p>
      ) : null}
      <ul style={{ margin:0, paddingLeft:'1.1rem' }}>
        {tips.map((tip, i) => (
          <li key={i} style={{ fontSize:'0.78rem', color:'#92400e', marginBottom:'3px' }}>{tip}</li>
        ))}
      </ul>
    </div>
  )
}

function NutritionTab() {
  const { isWellness } = useAuth()
  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guidanceByChild, setGuidanceByChild] = useState({})
  const [pregnancyGuidance, setPregnancyGuidance] = useState(undefined)
  const [adultGuidance, setAdultGuidance] = useState(undefined)

  useEffect(() => {
    if (isWellness) {
      wellnessApi.adultNutrition()
        .then(({ data }) => setAdultGuidance(data))
        .catch(() => setAdultGuidance(null))
        .finally(() => setLoading(false))
      return
    }

    // Maternal: pregnancy nutrition (if currently pregnant) + under-5 children
    wellnessApi.myPregnancy()
      .then(({ data }) => setPregnancyGuidance(data))
      .catch(() => setPregnancyGuidance(null))

    householdsApi.list()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.results || []
        const h = list[0] || null
        setHousehold(h)
        const children = (h?.members || []).filter(m => m.patient_type === 'child')
        children.forEach(c => {
          wellnessApi.childNutrition(c.id)
            .then(({ data }) => setGuidanceByChild(g => ({ ...g, [c.id]: data })))
            .catch(() => setGuidanceByChild(g => ({ ...g, [c.id]: null })))
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isWellness])

  const children = (household?.members || []).filter(m => m.patient_type === 'child')

  if (loading) return <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem' }}>Loading…</div>

  // ── Wellness (non-pregnant) users ──────────────────────────────────────
  if (isWellness) {
    return (
      <div>
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
            <Sparkles size={18} color="#207652" />
            <p style={{ margin:0, fontWeight:700, fontSize:'0.95rem', color:'#0f172a' }}>Your Nutrition Guidance</p>
          </div>
          {adultGuidance ? (
            <>
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'10px 12px' }}>
                <ul style={{ margin:0, paddingLeft:'1.1rem' }}>
                  {adultGuidance.feeding_tips.map((tip, i) => (
                    <li key={i} style={{ fontSize:'0.78rem', color:'#166534', marginBottom:'3px' }}>{tip}</li>
                  ))}
                </ul>
              </div>
              <LocalFoodBlock tips={adultGuidance.local_food_tips} aiSuggestion={adultGuidance.local_food_ai_suggestion} />
            </>
          ) : (
            <p style={{ margin:0, fontSize:'0.85rem', color:'#94a3b8' }}>No nutrition guidance available yet.</p>
          )}
        </div>
      </div>
    )
  }

  // ── Maternal users: pregnancy nutrition + under-5 children ─────────────
  return (
    <div>
      {pregnancyGuidance ? (
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
            <Baby size={18} color="#207652" />
            <p style={{ margin:0, fontWeight:700, fontSize:'0.95rem', color:'#0f172a' }}>
              Your Pregnancy Nutrition — Week {pregnancyGuidance.current_week}
            </p>
          </div>
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'10px 12px' }}>
            <ul style={{ margin:0, paddingLeft:'1.1rem' }}>
              {pregnancyGuidance.trimester_content.nutrition.map((tip, i) => (
                <li key={i} style={{ fontSize:'0.78rem', color:'#166534', marginBottom:'3px' }}>{tip}</li>
              ))}
            </ul>
          </div>
          <LocalFoodBlock tips={pregnancyGuidance.local_food_tips} aiSuggestion={pregnancyGuidance.local_food_ai_suggestion} />
        </div>
      ) : null}

      {children.length === 0 ? (
        <div style={card}>
          <h4 style={{ margin:'0 0 0.5rem', fontSize:'0.9rem', fontWeight:700, color:'#0f172a' }}>Children Under Five</h4>
          <p style={{ margin:0, fontSize:'0.85rem', color:'#94a3b8' }}>
            No children under five linked to your household yet.
          </p>
        </div>
      ) : (
        children.map(c => {
          const g = guidanceByChild[c.id]
          return (
            <div key={c.id} style={card}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <Baby size={18} color="#207652" />
                <p style={{ margin:0, fontWeight:700, fontSize:'0.95rem', color:'#0f172a' }}>{c.patient_name} · Age {c.age}</p>
              </div>

              {g === undefined ? (
                <p style={{ margin:0, fontSize:'0.82rem', color:'#94a3b8' }}>Loading guidance…</p>
              ) : g === null ? (
                <p style={{ margin:0, fontSize:'0.82rem', color:'#94a3b8' }}>
                  No date of birth on file yet — ask your health worker to add one so we can show age-appropriate guidance.
                </p>
              ) : (
                <>
                  <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'10px 12px', marginBottom:'10px' }}>
                    <p style={{ margin:'0 0 6px', fontSize:'0.8rem', fontWeight:600, color:'#166534' }}>
                      Feeding guidance — {g.age_band}
                    </p>
                    <ul style={{ margin:0, paddingLeft:'1.1rem' }}>
                      {g.feeding_tips.map((tip, i) => (
                        <li key={i} style={{ fontSize:'0.78rem', color:'#166534', marginBottom:'3px' }}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'10px', padding:'10px 12px' }}>
                    <p style={{ margin:'0 0 6px', fontSize:'0.8rem', fontWeight:600, color:'#991b1b' }}>
                      Seek care immediately if you see
                    </p>
                    <ul style={{ margin:0, paddingLeft:'1.1rem' }}>
                      {g.danger_signs.slice(0, 5).map((sign, i) => (
                        <li key={i} style={{ fontSize:'0.78rem', color:'#991b1b', marginBottom:'3px' }}>{sign}</li>
                      ))}
                    </ul>
                  </div>
                  <LocalFoodBlock tips={g.local_food_tips} aiSuggestion={g.local_food_ai_suggestion} />
                </>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Root portal ───────────────────────────────────────────────────────────────
const TABS = [
  { id:'pregnancy', label:'Pregnancy Tracker', icon: Baby        },
  { id:'cycle',     label:'Cycle Tracker',     icon: Droplet     },
  { id:'household', label:'My Household',      icon: Home        },
  { id:'nutrition', label:'Nutrition',         icon: Sparkles    },
  { id:'reviews',   label:'My Reviews',        icon: Star        },
  { id:'oncall',    label:'On-Call',           icon: PhoneCall   },
  { id:'transport', label:'Transport',         icon: Truck       },
  { id:'health',    label:'My Health',         icon: HeartPulse  },
]

// A non-pregnant Wellness user only gets cycle tracking, adult nutrition
// guidance, and paid telehealth — the rest (pregnancy tracker, household,
// reviews, transport, my health) are Maternal-only and would be empty or
// meaningless for her. On-Call is relabeled "Consult" for Wellness users
// only — Maternal keeps "On-Call" as-is (explicit product decision).
const WELLNESS_TAB_IDS = ['cycle', 'nutrition', 'oncall']

// Each tab gets a color befitting its function — carried through as a
// soft tint when inactive and a solid fill when active, so the whole
// bar visibly shifts mood with the selected section.
const TAB_COLORS = {
  pregnancy: { tint: '#dcfce7', text: '#166534', solid: '#16a34a' },
  cycle:     { tint: '#fce7f3', text: '#831843', solid: '#be185d' },
  household: { tint: '#dcfce7', text: '#166534', solid: '#207652' },
  nutrition: { tint: '#fef3c7', text: '#92400e', solid: '#b45309' },
  reviews:   { tint: '#fef3c7', text: '#92400e', solid: '#b45309' },
  oncall:    { tint: '#dbeafe', text: '#1e3a8a', solid: '#1d4ed8' },
  transport: { tint: '#ffedd5', text: '#9a3412', solid: '#c2410c' },
  health:    { tint: '#f3e8ff', text: '#6b21a8', solid: '#7e22ce' },
}

export default function PatientPortalPage() {
  const { user, isWellness } = useAuth()

  const visibleTabs = (isWellness ? TABS.filter(t => WELLNESS_TAB_IDS.includes(t.id)) : TABS)
    .map(t => t.id === 'oncall' && isWellness ? { ...t, label: 'Consult' } : t)

  const [active, setActive] = useState(isWellness ? 'cycle' : 'pregnancy')

  const CurrentTab = {
    pregnancy: PregnancyTab,
    cycle:     CycleTrackerTab,
    household: HouseholdTab,
    nutrition: NutritionTab,
    reviews:   ReviewsTab,
    oncall:    OnCallTab,
    transport: TransportTab,
    health:    MyHealthTab,
  }[active]

  return (
    <div style={{ maxWidth:'680px', margin:'0 auto', padding:'1.25rem 1rem 3rem' }}>
      {/* Header */}
      <div style={{ marginBottom:'1.25rem' }}>
        <h1 style={{ margin:0, fontFamily:'Georgia, serif', fontSize:'1.4rem', color:'#0f172a' }}>
          Welcome, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ margin:'4px 0 0', fontSize:'0.875rem', color:'#64748b' }}>Your personal wellness &amp; maternity care portal</p>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:'6px', overflowX:'auto', paddingBottom:'4px', marginBottom:'1.25rem' }}>
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const c = TAB_COLORS[id]
          const isActive = active === id
          return (
            <button key={id} onClick={() => setActive(id)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', padding:'9px 14px', border:'none', borderRadius:'10px', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                background: isActive ? c.solid : c.tint,
                color:       isActive ? 'white' : c.text,
                boxShadow:   isActive ? `0 2px 8px ${c.solid}55` : '0 1px 3px rgba(0,0,0,0.06)',
                fontWeight:  isActive ? 600 : 500, fontSize:'0.78rem',
                transition: 'background 0.15s ease, color 0.15s ease' }}>
              <Icon size={17} />
              {label}
            </button>
          )
        })}
      </div>

      {/* Active tab */}
      <CurrentTab />
    </div>
  )
}
