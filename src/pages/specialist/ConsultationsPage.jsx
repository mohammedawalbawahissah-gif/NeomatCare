import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { consultationsApi } from '@/api/client'
import { PageSpinner, StatusBadge, Spinner } from '@/components/ui'
import { Video, VideoOff, Phone, PhoneOff, ArrowLeft, Send, ChevronRight, Clock, MessageSquare, Plus, X, Mic, MicOff, Edit2, Trash2, Save } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'

const inputStyle = { width:'100%', padding:'10px 14px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', boxSizing:'border-box', background:'white' }
const labelStyle = { display:'block', fontSize:'0.875rem', fontWeight:500, color:'#374151', marginBottom:'6px' }
const gridStyle  = (cols) => ({ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:'12px', marginBottom:'12px' })

// Specialty values match backend SpecialistProfile.Specialty choices
const SPECIALTIES = [
  { value:'obstetrics',         label:'Obstetrics' },
  { value:'gynecology',         label:'Gynaecology' },
  { value:'neonatology',        label:'Neonatology' },
  { value:'midwifery',          label:'Midwifery' },
  { value:'anaesthesiology',    label:'Anaesthesiology' },
  { value:'internal_medicine',  label:'Internal Medicine' },
  { value:'emergency_medicine', label:'Emergency Medicine' },
  { value:'other',              label:'Other' },
]

// ── Add Specialist Modal ──────────────────────────────────────────────────────
// POST /api/consultations/specialists/
// Fields from SpecialistProfileSerializer:
//   name (write-only, links user or sets display_name),
//   professional_pin*, specialty*, years_experience, qualification,
//   whatsapp_number, is_available, specialist_phone, specialist_email,
//   bio, emergency_contact, facility
function AddSpecialistModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name:'', professional_pin:'', specialty:'obstetrics',
    qualification:'', years_experience:0,
    specialist_phone:'', specialist_email:'',
    whatsapp_number:'', emergency_contact:'', bio:'',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim())             { setError('Specialist name is required.'); return }
    if (!form.professional_pin.trim()) { setError('Professional pin is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name:              form.name,
        professional_pin:  form.professional_pin,
        specialty:         form.specialty,
        qualification:     form.qualification,
        years_experience:  Number(form.years_experience),
        specialist_phone:  form.specialist_phone,
        specialist_email:  form.specialist_email,
        whatsapp_number:   form.whatsapp_number,
        emergency_contact: form.emergency_contact,
        bio:               form.bio,
      }
      const { data } = await consultationsApi.specialists.create(payload)
      onCreated(data); onClose()
      setForm({ name:'', professional_pin:'', specialty:'obstetrics', qualification:'', years_experience:0, specialist_phone:'', specialist_email:'', whatsapp_number:'', emergency_contact:'', bio:'' })
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to create specialist profile.')
    } finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:50,overflowY:'auto',background:'rgba(15,23,42,0.45)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px'}} onClick={onClose}>
      <div style={{position:'relative',background:'white',borderRadius:'16px',width:'100%',maxWidth:'520px',margin:'40px auto',boxShadow:'0 25px 50px rgba(0,0,0,0.35)'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:'1px solid #f1f5f9'}}>
          <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:600,color:'#0f172a'}}>Add Specialist Profile</h2>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'4px'}}><X size={18}/></button>
        </div>
        <div style={{padding:'20px 24px'}}>
          {error && <div style={{background:'#fff4f2',border:'1px solid #ffd0c8',borderRadius:'8px',padding:'10px 14px',color:'#c02812',fontSize:'0.85rem',marginBottom:'16px'}}>{error}</div>}
          <form onSubmit={handleSubmit} noValidate style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div><label style={labelStyle}>Specialist Name <span style={{color:'#e43418'}}>*</span></label><input value={form.name} onChange={set('name')} placeholder="e.g. Dr. Ama Owusu" style={inputStyle}/></div>
            <div><label style={labelStyle}>Professional Pin <span style={{color:'#e43418'}}>*</span></label><input value={form.professional_pin} onChange={set('professional_pin')} placeholder="e.g. MDC/PN/XXXXX" style={inputStyle}/></div>
            <div style={gridStyle(2)}>
              <div><label style={labelStyle}>Specialty <span style={{color:'#e43418'}}>*</span></label>
                <select value={form.specialty} onChange={set('specialty')} style={inputStyle}>
                  {SPECIALTIES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Years Experience</label><input type="number" min={0} value={form.years_experience} onChange={set('years_experience')} style={inputStyle}/></div>
              <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Qualification</label><input value={form.qualification} onChange={set('qualification')} placeholder="e.g. MBChB, FWACS" style={inputStyle}/></div>
              <div><label style={labelStyle}>Phone</label><input type="tel" value={form.specialist_phone} onChange={set('specialist_phone')} placeholder="e.g. 0241234567" style={inputStyle}/></div>
              <div><label style={labelStyle}>Email</label><input type="email" value={form.specialist_email} onChange={set('specialist_email')} placeholder="doctor@email.com" style={inputStyle}/></div>
              <div><label style={labelStyle}>WhatsApp</label><input type="tel" value={form.whatsapp_number} onChange={set('whatsapp_number')} placeholder="e.g. 0241234567" style={inputStyle}/></div>
              <div><label style={labelStyle}>Emergency Contact</label><input type="tel" value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="Alternative contact" style={inputStyle}/></div>
              <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Bio</label><textarea rows={2} value={form.bio} onChange={set('bio')} style={{...inputStyle,resize:'vertical'}} placeholder="Brief professional bio..."/></div>
            </div>
            <div style={{display:'flex',gap:'10px',paddingTop:'12px',borderTop:'1px solid #f1f5f9'}}>
              <button type="button" onClick={onClose} style={{flex:1,padding:'11px',background:'white',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.875rem',fontWeight:500,cursor:'pointer',color:'#475569'}}>Cancel</button>
              <button type="submit" disabled={saving} style={{flex:2,padding:'11px',background:saving?'#7cb99a':'#207652',color:'white',border:'none',borderRadius:'8px',fontSize:'0.875rem',fontWeight:500,cursor:saving?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                {saving?<><Spinner size={14} className="text-white"/>Creating…</>:'Create Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Consultation Status Modal ─────────────────────────────────────────────────
// PATCH /api/consultations/{id}/status/ → { status?, notes? }
// Consultation status values: pending, active, completed, cancelled
function ConsultStatusModal({ open, onClose, consultation, onUpdated }) {
  const [newStatus, setNewStatus] = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const STATUS_OPTIONS = [
    { v:'active',    l:'Mark Active' },
    { v:'completed', l:'Complete' },
    { v:'cancelled', l:'Cancel' },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const payload = { status: newStatus }
      if (notes) payload.notes = notes
      const { data } = await consultationsApi.updateStatus(consultation.id, payload)
      onUpdated(data); onClose()
    } catch { setError('Failed to update status.') }
    finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:50,overflowY:'auto',background:'rgba(15,23,42,0.45)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px'}} onClick={onClose}>
      <div style={{position:'relative',background:'white',borderRadius:'16px',width:'100%',maxWidth:'440px',margin:'40px auto',boxShadow:'0 25px 50px rgba(0,0,0,0.35)'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:'1px solid #f1f5f9'}}>
          <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:600,color:'#0f172a'}}>Update Consultation</h2>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'4px'}}><X size={18}/></button>
        </div>
        <div style={{padding:'20px 24px'}}>
          {error && <div style={{background:'#fff4f2',border:'1px solid #ffd0c8',borderRadius:'8px',padding:'10px 14px',color:'#c02812',fontSize:'0.85rem',marginBottom:'16px'}}>{error}</div>}
          <form onSubmit={handleSubmit} noValidate style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div><label style={labelStyle}>Action <span style={{color:'#e43418'}}>*</span></label>
              <select value={newStatus} onChange={e=>setNewStatus(e.target.value)} style={inputStyle}>
                <option value="">— Select —</option>
                {STATUS_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Notes</label>
              <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} style={{...inputStyle,resize:'vertical'}} placeholder="Clinical notes, findings, recommendations…"/>
            </div>
            <div style={{display:'flex',gap:'10px',paddingTop:'12px',borderTop:'1px solid #f1f5f9'}}>
              <button type="button" onClick={onClose} style={{flex:1,padding:'11px',background:'white',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.875rem',fontWeight:500,cursor:'pointer',color:'#475569'}}>Cancel</button>
              <button type="submit" disabled={!newStatus||saving} style={{flex:2,padding:'11px',background:(!newStatus||saving)?'#7cb99a':'#207652',color:'white',border:'none',borderRadius:'8px',fontSize:'0.875rem',fontWeight:500,cursor:(!newStatus||saving)?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                {saving?<><Spinner size={14} className="text-white"/>Updating…</>:'Confirm'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Call Panel ────────────────────────────────────────────────────────────────
function CallPanel({ consultation }) {
  const [callType, setCallType]   = useState(null) // null | 'video' | 'audio'
  const [inCall, setInCall]       = useState(false)
  const [muted, setMuted]         = useState(false)
  const [videoOff, setVideoOff]   = useState(false)
  const [callDuration, setDuration] = useState(0)
  const timerRef = useRef(null)

  const specialist = consultation?.specialist_detail
  const phone      = specialist?.specialist_phone || specialist?.whatsapp_number
  const canCall    = !['completed','cancelled'].includes(consultation?.status)

  const startCall = (type) => {
    setCallType(type)
    setInCall(true)
    setDuration(0)
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  const endCall = () => {
    setInCall(false)
    setCallType(null)
    setMuted(false)
    setVideoOff(false)
    clearInterval(timerRef.current)
    setDuration(0)
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  const fmt = (s) => String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0")

  if (inCall) return (
    <div className="card" style={{overflow:'hidden'}}>
      <div style={{background:'linear-gradient(135deg,#0f172a,#1e293b)',padding:'32px 24px',textAlign:'center',position:'relative'}}>
        <div style={{width:72,height:72,borderRadius:'50%',background:'linear-gradient(135deg,#207652,#2f9466)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.8rem',margin:'0 auto 12px',boxShadow:'0 0 0 4px rgba(47,148,102,0.3)'}}>
          {callType === 'video' ? '📹' : '📞'}
        </div>
        <p style={{color:'white',fontWeight:600,fontSize:'1rem',margin:'0 0 4px'}}>
          {specialist?.user_name || 'Specialist'}
        </p>
        <p style={{color:'#94a3b8',fontSize:'0.8rem',margin:'0 0 8px'}}>
          {callType === 'video' ? 'Video call' : 'Audio call'} · {fmt(callDuration)}
        </p>
        {callType === 'video' && (
          <div style={{width:'100%',height:180,background:'#1e293b',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',marginTop:'16px',border:'1px solid #334155'}}>
            {videoOff
              ? <div style={{textAlign:'center'}}><VideoOff size={28} color="#64748b"/><p style={{color:'#64748b',fontSize:'0.75rem',marginTop:'8px'}}>Camera off</p></div>
              : <p style={{color:'#475569',fontSize:'0.8rem'}}>Camera preview</p>
            }
          </div>
        )}
      </div>
      <div style={{padding:'16px 24px',display:'flex',justifyContent:'center',gap:'16px',background:'white'}}>
        <button onClick={() => setMuted(m => !m)} title={muted?'Unmute':'Mute'}
          style={{width:48,height:48,borderRadius:'50%',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:muted?'#fee2e2':'#f1f5f9',color:muted?'#c02812':'#475569',transition:'all 0.15s'}}>
          {muted ? <MicOff size={18}/> : <Mic size={18}/>}
        </button>
        {callType === 'video' && (
          <button onClick={() => setVideoOff(v => !v)} title={videoOff?'Turn camera on':'Turn camera off'}
            style={{width:48,height:48,borderRadius:'50%',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:videoOff?'#fee2e2':'#f1f5f9',color:videoOff?'#c02812':'#475569',transition:'all 0.15s'}}>
            {videoOff ? <VideoOff size={18}/> : <Video size={18}/>}
          </button>
        )}
        <button onClick={endCall} title="End call"
          style={{width:56,height:56,borderRadius:'50%',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:'#c02812',color:'white',boxShadow:'0 4px 12px rgba(192,40,18,0.4)',transition:'all 0.15s'}}>
          <PhoneOff size={20}/>
        </button>
      </div>
    </div>
  )

  return (
    <div className="card px-5 py-4">
      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'14px'}}>
        <div style={{width:28,height:28,background:'#f0fdf4',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Phone size={14} color="#207652"/>
        </div>
        <p style={{margin:0,fontWeight:600,fontSize:'0.9rem',color:'#0f172a'}}>Call Specialist</p>
      </div>

      {!canCall ? (
        <p style={{fontSize:'0.8rem',color:'#94a3b8',textAlign:'center',padding:'8px 0'}}>
          Calls are unavailable for {consultation?.status} consultations
        </p>
      ) : (
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={() => startCall('video')} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',padding:'14px 10px',background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:'12px',cursor:'pointer',transition:'all 0.15s'}}
            onMouseOver={e=>{e.currentTarget.style.background='#dcfce7';e.currentTarget.style.borderColor='#86efac'}}
            onMouseOut={e=>{e.currentTarget.style.background='#f0fdf4';e.currentTarget.style.borderColor='#bbf7d0'}}>
            <div style={{width:40,height:40,background:'white',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
              <Video size={20} color="#207652"/>
            </div>
            <span style={{fontSize:'0.8rem',fontWeight:600,color:'#207652'}}>Video Call</span>
          </button>

          <button onClick={() => phone ? window.open('tel:' + phone) : startCall('audio')}
            style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',padding:'14px 10px',background:'#eff6ff',border:'1.5px solid #bfdbfe',borderRadius:'12px',cursor:'pointer',transition:'all 0.15s'}}
            onMouseOver={e=>{e.currentTarget.style.background='#dbeafe';e.currentTarget.style.borderColor='#93c5fd'}}
            onMouseOut={e=>{e.currentTarget.style.background='#eff6ff';e.currentTarget.style.borderColor='#bfdbfe'}}>
            <div style={{width:40,height:40,background:'white',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
              <Phone size={20} color="#1d4ed8"/>
            </div>
            <span style={{fontSize:'0.8rem',fontWeight:600,color:'#1d4ed8'}}>Audio Call</span>
          </button>
        </div>
      )}

      {specialist?.whatsapp_number && (
        <a href={"https://wa.me/" + specialist.whatsapp_number.replace(/\D/g, "")} target="_blank" rel="noreferrer"
          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',marginTop:'10px',padding:'10px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'10px',textDecoration:'none',color:'#207652',fontSize:'0.8rem',fontWeight:600}}>
          💬 WhatsApp
        </a>
      )}
    </div>
  )
}

// ── Chat Panel ────────────────────────────────────────────────────────────────
// Messages API: GET/POST /api/consultations/{id}/messages/
// Message fields: id, consultation, sender, sender_name, body, created_at
function ChatPanel({ consultationId, initialMessages, user }) {
  const [messages, setMessages] = useState(initialMessages || [])
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  // Poll every 5 seconds for new messages
  useEffect(() => {
    const interval = setInterval(() => {
      consultationsApi.messages.list(consultationId)
        .then(({ data }) => setMessages(Array.isArray(data) ? data : data.results || []))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [consultationId])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    try {
      const { data } = await consultationsApi.messages.send(consultationId, text.trim())
      setMessages(m => [...m, data]); setText('')
    } catch {}
    setSending(false)
  }

  return (
    <div className="card flex flex-col" style={{height:420}}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <MessageSquare size={15} className="text-purple-500"/>
        <p className="font-medium text-slate-800 text-sm">Chat</p>
        <span className="text-xs text-slate-400 ml-auto">Auto-refreshes every 5s</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && <p className="text-center text-sm text-slate-400 pt-12">No messages yet. Start the conversation.</p>}
        {messages.map(m => {
          const isMe = m.sender_name === user?.name
          return (
            <div key={m.id} className={`flex ${isMe?'justify-end':'justify-start'}`}>
              <div style={{maxWidth:'75%',padding:'10px 14px',borderRadius:isMe?'16px 16px 4px 16px':'16px 16px 16px 4px',
                background:isMe?'#207652':'#f1f5f9', color:isMe?'white':'#1e293b',
                fontSize:'0.875rem', lineHeight:'1.5'}}>
                {!isMe && <p style={{fontSize:'0.7rem',fontWeight:600,marginBottom:'2px',opacity:0.6}}>{m.sender_name}</p>}
                <p style={{margin:0}}>{m.body}</p>
                {/* created_at is the timestamp field on ConsultationMessage */}
                <p style={{fontSize:'0.65rem',marginTop:'4px',opacity:0.6,textAlign:isMe?'right':'left'}}>{format(new Date(m.created_at),'HH:mm')}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef}/>
      </div>
      <form onSubmit={handleSend} className="px-4 py-3 border-t border-slate-100 flex gap-2">
        <input value={text} onChange={e=>setText(e.target.value)} className="input-field flex-1 text-sm" placeholder="Type a message..."/>
        <button type="submit" disabled={sending||!text.trim()} className="btn-primary px-3 py-2.5">
          {sending ? <Spinner size={14} className="text-white"/> : <Send size={14}/>}
        </button>
      </form>
    </div>
  )
}

// ── Consultations List Page ───────────────────────────────────────────────────
export function ConsultationsPage() {
  const { user, isSuperAdmin, isFacilityAdmin } = useAuth()
  const [tab, setTab]                           = useState('consultations')
  const [items, setItems]                       = useState([])
  const [specialists, setSpecialists]           = useState([])
  const [loading, setLoading]                   = useState(true)
  const [specialistModal, setSpecialistModal]   = useState(false)

  const canManage = isSuperAdmin || isFacilityAdmin

  useEffect(() => {
    Promise.all([consultationsApi.list(), consultationsApi.specialists.list()])
      .then(([{ data: c }, { data: s }]) => {
        setItems(Array.isArray(c) ? c : c.results || [])
        setSpecialists(Array.isArray(s) ? s : s.results || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  // Consultation status values: pending, active, completed, cancelled
  const pending   = items.filter(c => c.status === 'pending')
  const active    = items.filter(c => c.status === 'active')
  const closed    = items.filter(c => ['completed','cancelled'].includes(c.status))

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Consultations</h1>
          <p className="text-slate-500 text-sm mt-1">{items.length} consultation{items.length!==1?'s':''} · {specialists.length} specialist{specialists.length!==1?'s':''}</p>
        </div>
        {canManage && <button onClick={() => setSpecialistModal(true)} className="btn-primary"><Plus size={16}/> Add Specialist</button>}
      </div>

      <div style={{display:'flex',gap:'4px',background:'#f1f5f9',borderRadius:'12px',padding:'4px',width:'fit-content'}}>
        {[['consultations',`All (${items.length})`],['specialists',`Specialists (${specialists.length})`]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{padding:'8px 16px',borderRadius:'8px',fontSize:'0.875rem',fontWeight:500,border:'none',cursor:'pointer',transition:'all 0.15s',background:tab===v?'white':'transparent',color:tab===v?'#0f172a':'#64748b',boxShadow:tab===v?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>{l}</button>
        ))}
      </div>

      {tab === 'consultations' && (
        items.length === 0 ? (
          <div className="card p-8 text-center">
            <div style={{fontSize:'3rem',marginBottom:'12px'}}>💬</div>
            <p className="font-medium text-slate-700 mb-1">No consultations yet</p>
            <p className="text-sm text-slate-400">Consultations are requested from an emergency case page</p>
          </div>
        ) : (
          <div className="space-y-5">
            {[['🔔 Pending', pending], ['⚡ Active', active], ['✅ Closed', closed]].map(([title, group]) =>
              group.length > 0 && (
                <div key={title}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</p>
                  <div className="card divide-y divide-slate-50">
                    {group.map(c => (
                      <Link key={c.id} to={`/app/consultations/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                        <div style={{width:40,height:40,background:'#f3e8ff',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <Video size={18} className="text-purple-600"/>
                        </div>
                        <div className="min-w-0 flex-1">
                          {/* SpecialistProfile returns user_name and specialty via serializer methods */}
                          <p className="text-sm font-semibold text-slate-900">
                            {c.specialist ? `Specialist #${String(c.specialist).slice(0,8)}` : 'Unassigned'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Clock size={10}/> {formatDistanceToNow(new Date(c.created_at),{addSuffix:true})}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={c.status}/>
                          <ChevronRight size={16} className="text-slate-300"/>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )
      )}

      {tab === 'specialists' && (
        specialists.length === 0 ? (
          <div className="card p-8 text-center">
            <div style={{fontSize:'3rem',marginBottom:'12px'}}>👨‍⚕️</div>
            <p className="font-medium text-slate-700 mb-1">No specialists registered yet</p>
            <p className="text-sm text-slate-400 mb-4">Add specialist profiles so health workers can request consultations</p>
            {canManage && <button onClick={() => setSpecialistModal(true)} className="btn-primary mx-auto"><Plus size={16}/> Add Specialist</button>}
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'16px'}}>
            {specialists.map(s => (
              <div key={s.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    {/* user_name resolved by serializer get_user_name() — falls back to display_name */}
                    <p className="font-semibold text-slate-900">{s.user_name || s.display_name}</p>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">{s.specialty?.replace(/_/g,' ')}</p>
                  </div>
                  <span style={{fontSize:'0.7rem',padding:'3px 10px',borderRadius:'999px',fontWeight:600,background:s.is_available?'#dcf1e6':'#f1f5f9',color:s.is_available?'#1a5e42':'#64748b'}}>
                    {s.is_available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                {s.qualification     && <p className="text-xs text-slate-500">🎓 {s.qualification}</p>}
                {s.years_experience > 0 && <p className="text-xs text-slate-500">⏱ {s.years_experience} years experience</p>}
                {s.bio               && <p className="text-xs text-slate-400 italic leading-relaxed">{s.bio}</p>}
              </div>
            ))}
          </div>
        )
      )}

      <AddSpecialistModal open={specialistModal} onClose={() => setSpecialistModal(false)} onCreated={s => setSpecialists(prev => [s,...prev])}/>
    </div>
  )
}


// ── Edit Consultation Modal ───────────────────────────────────────────────────
function EditConsultationModal({ open, onClose, consultation, onUpdated }) {
  const [form, setForm] = useState({ notes: consultation?.notes || '', specialist: consultation?.specialist || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}))

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const { data } = await consultationsApi.updateStatus(consultation.id, { notes: form.notes })
      onUpdated(data); onClose()
    } catch { setError('Failed to update consultation.') }
    finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:50,background:'rgba(15,23,42,0.45)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={onClose}>
      <div style={{background:'white',borderRadius:'16px',width:'100%',maxWidth:'440px',boxShadow:'0 25px 50px rgba(0,0,0,0.35)',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:'1px solid #f1f5f9'}}>
          <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:600,color:'#0f172a'}}>Edit Consultation</h2>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'4px'}}><X size={18}/></button>
        </div>
        <div style={{padding:'20px 24px'}}>
          {error && <div style={{background:'#fff4f2',border:'1px solid #ffd0c8',borderRadius:'8px',padding:'10px 14px',color:'#c02812',fontSize:'0.82rem',marginBottom:'14px'}}>{error}</div>}
          <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'14px'}}>
            <div>
              <label style={{display:'block',fontSize:'0.8rem',fontWeight:600,color:'#64748b',marginBottom:'6px'}}>Clinical Notes</label>
              <textarea rows={4} value={form.notes} onChange={set('notes')} style={{width:'100%',padding:'10px 14px',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.875rem',outline:'none',boxSizing:'border-box',resize:'vertical'}} placeholder="Clinical findings, recommendations…"/>
            </div>
            <div style={{display:'flex',gap:'10px',paddingTop:'12px',borderTop:'1px solid #f1f5f9'}}>
              <button type="button" onClick={onClose} style={{flex:1,padding:'10px',background:'white',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.875rem',fontWeight:500,cursor:'pointer',color:'#475569'}}>Cancel</button>
              <button type="submit" disabled={saving} style={{flex:2,display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',padding:'10px',background:saving?'#7cb99a':'#207652',color:'white',border:'none',borderRadius:'8px',fontSize:'0.875rem',fontWeight:600,cursor:saving?'not-allowed':'pointer'}}>
                {saving ? 'Saving…' : <><Save size={14}/> Save Changes</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Delete Consultation Modal ─────────────────────────────────────────────────
function DeleteConsultationModal({ open, onClose, consultation, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await consultationsApi.delete(consultation.id)
      onDeleted(consultation.id)
    } catch { setError('Failed to delete. This consultation may have related records.'); setDeleting(false) }
  }

  if (!open) return null
  return (
    <div style={{position:'fixed',inset:0,zIndex:50,background:'rgba(15,23,42,0.45)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={onClose}>
      <div style={{background:'white',borderRadius:'16px',width:'100%',maxWidth:'380px',padding:'28px 24px',boxShadow:'0 25px 50px rgba(0,0,0,0.35)',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:52,height:52,background:'#fff1f2',borderRadius:'14px',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
          <Trash2 size={22} color="#c02812"/>
        </div>
        <h3 style={{margin:'0 0 8px',fontSize:'1.05rem',fontWeight:600,color:'#0f172a'}}>Delete Consultation?</h3>
        <p style={{margin:'0 0 20px',fontSize:'0.875rem',color:'#64748b'}}>This cannot be undone. All messages will be lost.</p>
        {error && <p style={{color:'#c02812',fontSize:'0.82rem',marginBottom:'12px'}}>{error}</p>}
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',background:'white',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.875rem',fontWeight:500,cursor:'pointer',color:'#475569'}}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} style={{flex:1,padding:'10px',background:deleting?'#f87171':'#c02812',color:'white',border:'none',borderRadius:'8px',fontSize:'0.875rem',fontWeight:600,cursor:deleting?'not-allowed':'pointer'}}>
            {deleting ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Consultation Detail Page ──────────────────────────────────────────────────
export function ConsultationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isSuperAdmin, isFacilityAdmin } = useAuth()
  const [consultation, setConsultation] = useState(null)
  const [messages, setMessages]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [statusModal, setStatusModal]   = useState(false)
  const [editModal, setEditModal]       = useState(false)
  const [deleteModal, setDeleteModal]   = useState(false)

  const canManage = isSuperAdmin || isFacilityAdmin

  useEffect(() => {
    Promise.all([consultationsApi.detail(id), consultationsApi.messages.list(id)])
      .then(([{ data: c }, { data: m }]) => {
        setConsultation(c)
        setMessages(Array.isArray(m) ? m : m.results || [])
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <PageSpinner />
  if (!consultation) return (
    <div className="p-6">
      <div style={{background:'#fff4f2',border:'1px solid #ffd0c8',borderRadius:'8px',padding:'12px 16px',color:'#c02812',fontSize:'0.875rem'}}>
        Consultation not found.
      </div>
    </div>
  )

  const c = consultation
  const canAct = !['completed','cancelled'].includes(c.status)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowLeft size={18}/></button>
        <div className="flex-1">
          <h1 className="section-title">Consultation</h1>
          <p className="text-xs text-slate-400 font-mono">{c.id}</p>
        </div>
        <StatusBadge status={c.status}/>
        {canAct && <button onClick={() => setStatusModal(true)} className="btn-primary text-sm">Update Status</button>}
        {canManage && (
          <div style={{display:'flex',gap:'6px'}}>
            <button onClick={() => setEditModal(true)} title="Edit consultation"
              style={{width:34,height:34,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#207652'}}>
              <Edit2 size={15}/>
            </button>
            {isSuperAdmin && (
              <button onClick={() => setDeleteModal(true)} title="Delete consultation"
                style={{width:34,height:34,background:'#fff1f2',border:'1px solid #fecdd3',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#c02812'}}>
                <Trash2 size={15}/>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <CallPanel consultation={c}/>
          <ChatPanel consultationId={c.id} initialMessages={messages} user={user}/>
          {c.notes && (
            <div className="card px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-slate-800 leading-relaxed bg-brand-50 px-3 py-2.5 rounded-lg border border-brand-100">{c.notes}</p>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="card px-5 py-4 space-y-3">
            <div>
              <p className="text-xs text-slate-400">Requested by</p>
              <p className="text-sm font-medium text-slate-800">{c.requested_by || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Specialist</p>
              <p className="text-sm font-medium text-slate-800">{c.specialist || 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Status</p>
              <StatusBadge status={c.status}/>
            </div>
            <div>
              <p className="text-xs text-slate-400">Created</p>
              <p className="text-sm font-medium text-slate-800">{format(new Date(c.created_at),'dd MMM yyyy, HH:mm')}</p>
            </div>
            {c.referral && (
              <div>
                <p className="text-xs text-slate-400">Referral</p>
                <Link to={`/app/referrals/${c.referral}`} className="text-sm font-medium text-brand-600 hover:underline">View Referral</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConsultStatusModal open={statusModal} onClose={() => setStatusModal(false)} consultation={c} onUpdated={setConsultation}/>
      <EditConsultationModal open={editModal} onClose={() => setEditModal(false)} consultation={c} onUpdated={setConsultation}/>
      <DeleteConsultationModal open={deleteModal} onClose={() => setDeleteModal(false)} consultation={c}
        onDeleted={() => navigate('/app/consultations')}/>
    </div>
  )
}
