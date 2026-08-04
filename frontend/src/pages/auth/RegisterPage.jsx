import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi, facilitiesApi } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  Heart, Eye, EyeOff, ArrowRight, CheckCircle,
  Mail, Lock, User, Shield, Building2, Phone,
  CreditCard, MessageSquare, RotateCcw, KeyRound, Clock,
} from 'lucide-react'

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white',
}
const labelStyle = { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }

const ROLES = [
  { value: 'health_worker',  label: 'Health Worker' },
  { value: 'facility_admin', label: 'Facility Admin' },
  { value: 'specialist',     label: 'Specialist' },
  { value: 'driver',         label: 'Driver' },
]
const FACILITY_REQUIRED = ['health_worker', 'facility_admin']

// ── Step 1: Details form ──────────────────────────────────────────────────────
function DetailsForm({ onSuccess }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', password2: '',
    role: 'health_worker', facility: '',
    phone_number: '', license_number: '', otp_channel: 'sms',
  })
  const [facilities,        setFacilities]        = useState([])
  const [facilitiesLoading, setFacilitiesLoading] = useState(true)
  const [facilitiesError,   setFacilitiesError]   = useState(false)
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    facilitiesApi.list()
      .then(({ data }) => setFacilities(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setFacilitiesError(true))
      .finally(() => setFacilitiesLoading(false))
  }, [])

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const needsFacility = FACILITY_REQUIRED.includes(form.role)
  const needsPhone    = form.otp_channel === 'sms' || form.role === 'driver'

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    if (form.password !== form.password2) { setError('Passwords do not match.'); return }
    if (needsFacility && !form.facility)  { setError('Please select a facility.'); return }
    if (form.otp_channel === 'sms' && !form.phone_number.trim()) {
      setError('Phone number is required for SMS verification.'); return
    }
    setLoading(true)
    try {
      const payload = {
        name: form.name, email: form.email,
        password: form.password, password2: form.password2,
        role: form.role, otp_channel: form.otp_channel,
        ...(needsFacility && { facility: form.facility }),
        ...(form.phone_number   && { phone_number:   form.phone_number }),
        ...(form.license_number && { license_number: form.license_number }),
      }
      const { data } = await authApi.register(payload)
      onSuccess({ userId: data.user_id, channel: data.channel, email: form.email, phone: form.phone_number })
    } catch (err) {
      const d = err?.response?.data
      if (d && typeof d === 'object') {
        const key = Object.keys(d)[0]
        const msg = Array.isArray(d[key]) ? d[key][0] : d[key]
        setError(msg || 'Registration failed.')
      } else { setError('Registration failed. Please try again.') }
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && <div style={{ background:'#fff4f2', border:'1px solid #ffd0c8', borderRadius:'8px', padding:'0.75rem 1rem', color:'#c02812', fontSize:'0.875rem' }}>{error}</div>}

      {/* Name */}
      <div>
        <label style={labelStyle}>Full Name <span style={{ color:'#e43418' }}>*</span></label>
        <div style={{ position:'relative' }}>
          <User size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input required value={form.name} onChange={set('name')} placeholder="e.g. Ama Owusu" style={{ ...inputStyle, paddingLeft:'38px' }} />
        </div>
      </div>

      {/* Email */}
      <div>
        <label style={labelStyle}>Email Address <span style={{ color:'#e43418' }}>*</span></label>
        <div style={{ position:'relative' }}>
          <Mail size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input type="email" required value={form.email} onChange={set('email')} placeholder="you@facility.gh" style={{ ...inputStyle, paddingLeft:'38px' }} />
        </div>
      </div>

      {/* Role */}
      <div>
        <label style={labelStyle}>Role <span style={{ color:'#e43418' }}>*</span></label>
        <div style={{ position:'relative' }}>
          <Shield size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
          <select value={form.role} onChange={set('role')} style={{ ...inputStyle, paddingLeft:'38px', cursor:'pointer' }}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Facility */}
      {needsFacility && (
        <div>
          <label style={labelStyle}>Facility <span style={{ color:'#e43418' }}>*</span></label>
          <div style={{ position:'relative' }}>
            <Building2 size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
            {facilitiesLoading
              ? <input disabled placeholder="Loading facilities…" style={{ ...inputStyle, paddingLeft:'38px', color:'#94a3b8' }} />
              : facilitiesError
                ? <input disabled placeholder="Could not load facilities — refresh" style={{ ...inputStyle, paddingLeft:'38px', color:'#c02812' }} />
                : <select required value={form.facility} onChange={set('facility')} style={{ ...inputStyle, paddingLeft:'38px', cursor:'pointer' }}>
                    <option value="">— Select a facility —</option>
                    {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
            }
          </div>
        </div>
      )}

      {/* Verification channel */}
      <div>
        <label style={labelStyle}>Verify account via <span style={{ color:'#e43418' }}>*</span></label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
          {[{ value:'sms', label:'📱 SMS', sub:'Text to phone' }, { value:'email', label:'✉️ Email', sub:'Code to inbox' }].map(ch => (
            <button key={ch.value} type="button" onClick={() => setForm(p => ({ ...p, otp_channel: ch.value }))}
              style={{ padding:'10px', border:`2px solid ${form.otp_channel===ch.value?'#207652':'#e2e8f0'}`, borderRadius:'8px', background:form.otp_channel===ch.value?'#f0f9f4':'white', cursor:'pointer', textAlign:'center' }}>
              <div style={{ fontWeight:600, fontSize:'0.875rem', color:form.otp_channel===ch.value?'#207652':'#374151' }}>{ch.label}</div>
              <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'2px' }}>{ch.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Phone — required for SMS, or driver */}
      {(needsPhone) && (
        <div>
          <label style={labelStyle}>Phone Number {form.otp_channel==='sms' && <span style={{ color:'#e43418' }}>*</span>}</label>
          <div style={{ position:'relative' }}>
            <Phone size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
            <input required={form.otp_channel==='sms'} value={form.phone_number} onChange={set('phone_number')} placeholder="+233..." style={{ ...inputStyle, paddingLeft:'38px' }} />
          </div>
        </div>
      )}

      {/* License — driver only */}
      {form.role === 'driver' && (
        <div>
          <label style={labelStyle}>License Number <span style={{ color:'#94a3b8', fontWeight:400 }}>(optional)</span></label>
          <div style={{ position:'relative' }}>
            <CreditCard size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
            <input value={form.license_number} onChange={set('license_number')} placeholder="e.g. GH-1234-2020" style={{ ...inputStyle, paddingLeft:'38px' }} />
          </div>
        </div>
      )}

      {/* Password */}
      <div>
        <label style={labelStyle}>Password <span style={{ color:'#e43418' }}>*</span></label>
        <div style={{ position:'relative' }}>
          <Lock size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input type={showPw?'text':'password'} required minLength={8} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" style={{ ...inputStyle, paddingLeft:'38px', paddingRight:'40px' }} />
          <button type="button" onClick={() => setShowPw(v=>!v)} style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0 }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Confirm */}
      <div>
        <label style={labelStyle}>Confirm Password <span style={{ color:'#e43418' }}>*</span></label>
        <div style={{ position:'relative' }}>
          <Lock size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input type={showPw?'text':'password'} required value={form.password2} onChange={set('password2')} placeholder="Repeat your password" style={{ ...inputStyle, paddingLeft:'38px' }} />
        </div>
      </div>

      <button type="submit" disabled={loading}
        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'12px', background:loading?'#7cb99a':'#207652', color:'white', border:'none', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:loading?'not-allowed':'pointer', marginTop:'6px' }}>
        {loading ? 'Creating account…' : <><span>Continue</span><ArrowRight size={16} /></>}
      </button>
    </form>
  )
}

// ── Step 2: OTP verification ──────────────────────────────────────────────────
function OtpForm({ userId, channel, email, phone, onVerified }) {
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error,   setError]   = useState('')
  const [info,    setInfo]    = useState('')

  const hint = channel === 'sms'
    ? `We sent a 6-digit code to ${phone}`
    : `We sent a 6-digit code to ${email}`

  const handleVerify = async (e) => {
    e.preventDefault(); setError('')
    if (code.length !== 6) { setError('Please enter the 6-digit code.'); return }
    setLoading(true)
    try {
      const { data } = await authApi.verifyOtp({ user_id: userId, code })
      onVerified(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired code.')
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    setResending(true); setError(''); setInfo('')
    try {
      await authApi.resendOtp({ user_id: userId })
      setInfo('A new code has been sent.')
    } catch { setInfo('Could not resend. Try again shortly.') }
    finally { setResending(false) }
  }

  return (
    <form onSubmit={handleVerify} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      <div style={{ background:'#f0f9f4', border:'1px solid #bbe3ce', borderRadius:'8px', padding:'0.75rem 1rem', fontSize:'0.875rem', color:'#1a5e42' }}>
        {hint}
      </div>
      {error && <div style={{ background:'#fff4f2', border:'1px solid #ffd0c8', borderRadius:'8px', padding:'0.75rem 1rem', color:'#c02812', fontSize:'0.875rem' }}>{error}</div>}
      {info  && <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'0.75rem 1rem', color:'#1e40af', fontSize:'0.875rem' }}>{info}</div>}

      <div>
        <label style={labelStyle}>Verification Code <span style={{ color:'#e43418' }}>*</span></label>
        <div style={{ position:'relative' }}>
          <KeyRound size={16} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input
            maxLength={6} inputMode="numeric" pattern="[0-9]*"
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}
            placeholder="123456"
            style={{ ...inputStyle, paddingLeft:'38px', letterSpacing:'0.25rem', fontSize:'1.1rem', fontWeight:600, textAlign:'center' }}
          />
        </div>
        <p style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'4px' }}>Code expires in 10 minutes</p>
      </div>

      <button type="submit" disabled={loading}
        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'12px', background:loading?'#7cb99a':'#207652', color:'white', border:'none', borderRadius:'10px', fontSize:'0.9rem', fontWeight:600, cursor:loading?'not-allowed':'pointer' }}>
        {loading ? 'Verifying…' : <><CheckCircle size={16} /><span>Verify & Activate</span></>}
      </button>

      <button type="button" onClick={handleResend} disabled={resending}
        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'10px', background:'none', border:'1px solid #e2e8f0', borderRadius:'10px', fontSize:'0.875rem', color:'#64748b', cursor:resending?'not-allowed':'pointer' }}>
        <RotateCcw size={14} />{resending ? 'Sending…' : 'Resend code'}
      </button>
    </form>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const navigate = useNavigate()
  const { loginWithTokens } = useAuth()
  const [step,    setStep]    = useState('details') // 'details' | 'otp' | 'pending' | 'done'
  const [otpMeta, setOtpMeta] = useState(null)

  const handleDetailsSuccess = (meta) => {
    setOtpMeta(meta)
    setStep('otp')
  }

  const handleVerified = (data) => {
    if (data.pending_approval) {
      setStep('pending')
      return
    }
    // Auto-login with tokens from verify endpoint
    loginWithTokens(data.access, data.refresh, data.user)
    setStep('done')
    setTimeout(() => navigate('/app/dashboard'), 1500)
  }

  if (step === 'pending') {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a,#1e293b,#0a2319)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
        <div style={{ background:'white', borderRadius:'18px', padding:'3rem 2rem', boxShadow:'0 25px 50px rgba(0,0,0,0.4)', textAlign:'center', maxWidth:'420px', width:'100%' }}>
          <Clock size={52} color="#d97706" style={{ marginBottom:'1rem' }} />
          <h2 style={{ fontFamily:'Georgia, serif', fontSize:'1.35rem', color:'#0f172a', marginBottom:'0.5rem' }}>Awaiting Approval</h2>
          <p style={{ color:'#64748b', fontSize:'0.875rem', lineHeight:1.5 }}>
            Your account has been verified. A Facility Admin or SuperAdmin needs to approve it before
            you can log in — you'll be able to sign in once that happens.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a,#1e293b,#0a2319)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
        <div style={{ background:'white', borderRadius:'18px', padding:'3rem 2rem', boxShadow:'0 25px 50px rgba(0,0,0,0.4)', textAlign:'center', maxWidth:'380px', width:'100%' }}>
          <CheckCircle size={52} color="#207652" style={{ marginBottom:'1rem' }} />
          <h2 style={{ fontFamily:'Georgia, serif', fontSize:'1.35rem', color:'#0f172a', marginBottom:'0.5rem' }}>Account Verified!</h2>
          <p style={{ color:'#64748b', fontSize:'0.875rem' }}>Taking you to your dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a,#1e293b,#0a2319)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:'440px' }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ width:'56px', height:'56px', background:'#2f9466', borderRadius:'16px', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem', boxShadow:'0 10px 25px rgba(47,148,102,0.35)' }}>
            <Heart size={24} color="white" fill="white" />
          </div>
          <h1 style={{ color:'white', fontFamily:'Georgia, serif', fontSize:'1.9rem', margin:0 }}>NeoMatCare</h1>
          <p style={{ color:'#94a3b8', fontSize:'0.9rem', marginTop:'0.35rem' }}>Emergency Referral System</p>
        </div>

        <div style={{ background:'white', borderRadius:'18px', padding:'2rem', boxShadow:'0 25px 50px rgba(0,0,0,0.4)' }}>
          {/* Step indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'1.5rem' }}>
            {['Account Details','Verify Identity'].map((label, i) => {
              const stepNum  = i + 1
              const isCurrent = (step === 'details' && i === 0) || (step === 'otp' && i === 1)
              const isDone    = step === 'otp' && i === 0
              return (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:'6px', flex: i < 1 ? 'none' : 1 }}>
                  <div style={{ width:'24px', height:'24px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', fontWeight:700, background:isDone?'#207652':isCurrent?'#2f9466':'#e2e8f0', color:isDone||isCurrent?'white':'#94a3b8', flexShrink:0 }}>
                    {isDone ? '✓' : stepNum}
                  </div>
                  <span style={{ fontSize:'0.8rem', fontWeight:isCurrent?600:400, color:isCurrent?'#0f172a':'#94a3b8' }}>{label}</span>
                  {i < 1 && <div style={{ flex:1, height:'1px', background:'#e2e8f0', margin:'0 4px' }} />}
                </div>
              )
            })}
          </div>

          <h2 style={{ fontFamily:'Georgia, serif', fontSize:'1.2rem', color:'#0f172a', marginBottom:'0.25rem' }}>
            {step === 'details' ? 'Create staff account' : 'Enter verification code'}
          </h2>
          <p style={{ color:'#64748b', fontSize:'0.875rem', marginBottom:'1.25rem' }}>
            {step === 'details' ? 'Join the NeoMatCare platform' : 'Your account is almost ready'}
          </p>

          {step === 'details'
            ? <DetailsForm onSuccess={handleDetailsSuccess} />
            : <OtpForm {...otpMeta} onVerified={handleVerified} />
          }

          <p style={{ textAlign:'center', fontSize:'0.875rem', color:'#64748b', marginTop:'1.5rem' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color:'#207652', fontWeight:600, textDecoration:'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
