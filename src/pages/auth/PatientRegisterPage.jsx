import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { publicApi } from '@/api/client'
import {
  Heart, Eye, EyeOff, ArrowRight, CheckCircle,
  Mail, Lock, User, Phone, ShieldCheck,
} from 'lucide-react'

const inp = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white',
}
const lbl = { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }

function ErrorBox({ msg }) {
  if (!msg) return null
  return <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '0.75rem 1rem', color: '#c02812', fontSize: '0.875rem', marginBottom: '1rem' }}>{msg}</div>
}

function SuccessBox({ msg }) {
  if (!msg) return null
  return <div style={{ background: '#f0fdf4', border: '1px solid #bbe3ce', borderRadius: '8px', padding: '0.75rem 1rem', color: '#1a5e42', fontSize: '0.875rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={15} />{msg}</div>
}

export default function PatientRegisterPage() {
  const [step,   setStep]   = useState('register')  // 'register' | 'verify'
  const [userId, setUserId] = useState('')
  const [phone,  setPhone]  = useState('')

  const [form, setForm] = useState({ name: '', email: '', phone_number: '', password: '', password2: '' })
  const [otp,     setOtp]     = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [resent,  setResent]  = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.password2) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const { data } = await publicApi.post('/api/auth/register/', {
        ...form, role: 'patient',
      })
      setUserId(data.user_id)
      setPhone(form.phone_number)
      setStep('verify')
    } catch (err) {
      const d = err?.response?.data
      setError(d && typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Registration failed. Please try again.')
    } finally { setLoading(false) }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await publicApi.post('/api/auth/verify/', { user_id: userId, otp_code: otp })
      localStorage.setItem('access_token',  data.access)
      localStorage.setItem('refresh_token', data.refresh)
      window.location.href = '/app/dashboard'
    } catch (err) {
      setError(err?.response?.data?.detail || 'Invalid or expired code.')
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    setError(''); setResent(false)
    try {
      await publicApi.post('/api/auth/resend-otp/', { user_id: userId })
      setResent(true)
      setTimeout(() => setResent(false), 5000)
    } catch { setError('Could not resend. Please try again.') }
  }

  const pageStyle = { minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b,#0a2319)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }
  const cardStyle = { background: 'white', borderRadius: '18px', padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.4)' }
  const btnStyle  = (disabled) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', width: '100%', background: disabled ? '#7cb99a' : '#207652', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', marginTop: '6px' })

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '56px', height: '56px', background: '#2f9466', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 10px 25px rgba(47,148,102,0.35)' }}>
            <Heart size={24} color="white" fill="white" />
          </div>
          <h1 style={{ color: 'white', fontFamily: 'Georgia, serif', fontSize: '1.9rem', margin: 0 }}>NeoMatCare</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.35rem' }}>Patient Portal</p>
        </div>

        <div style={cardStyle}>
          {step === 'register' ? (
            <>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', color: '#0f172a', marginBottom: '0.25rem' }}>Create your account</h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>We'll send a verification code to your phone</p>

              <ErrorBox msg={error} />

              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={lbl}>Full Name <span style={{ color: '#e43418' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input required value={form.name} onChange={set('name')} placeholder="e.g. Ama Owusu" style={{ ...inp, paddingLeft: '38px' }} />
                  </div>
                </div>

                <div>
                  <label style={lbl}>Email Address <span style={{ color: '#e43418' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input type="email" required value={form.email} onChange={set('email')} placeholder="you@email.com" style={{ ...inp, paddingLeft: '38px' }} />
                  </div>
                </div>

                <div>
                  <label style={lbl}>Phone Number <span style={{ color: '#e43418' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input required value={form.phone_number} onChange={set('phone_number')} placeholder="+233 20 000 0000" style={{ ...inp, paddingLeft: '38px' }} />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Verification code will be sent here</p>
                </div>

                <div>
                  <label style={lbl}>Password <span style={{ color: '#e43418' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input type={showPw ? 'text' : 'password'} required minLength={8} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" style={{ ...inp, paddingLeft: '38px', paddingRight: '40px' }} />
                    <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={lbl}>Confirm Password <span style={{ color: '#e43418' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input type={showPw ? 'text' : 'password'} required value={form.password2} onChange={set('password2')} placeholder="Repeat your password" style={{ ...inp, paddingLeft: '38px' }} />
                  </div>
                </div>

                <button type="submit" disabled={loading} style={btnStyle(loading)}>
                  {loading ? 'Creating account…' : <><span>Continue</span><ArrowRight size={16} /></>}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '52px', height: '52px', background: '#f0fdf4', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                  <ShieldCheck size={24} color="#207652" />
                </div>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', color: '#0f172a', marginBottom: '0.25rem' }}>Verify your number</h2>
                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                  Enter the 6-digit code sent to {phone ? `your phone (${phone})` : 'your email'}
                </p>
              </div>

              <ErrorBox msg={error} />
              <SuccessBox msg={resent ? 'A new verification code has been sent.' : ''} />

              <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input
                  required maxLength={6} value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  style={{ ...inp, textAlign: 'center', fontSize: '1.75rem', letterSpacing: '0.4em', fontWeight: 700 }}
                />
                <button type="submit" disabled={loading || otp.length < 6} style={btnStyle(loading || otp.length < 6)}>
                  {loading ? 'Verifying…' : <><ShieldCheck size={16} /> Verify & Sign In</>}
                </button>
              </form>

              <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '1.25rem' }}>
                Didn't receive a code?{' '}
                <button onClick={handleResend} style={{ background: 'none', border: 'none', color: '#207652', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                  Resend
                </button>
              </p>
            </>
          )}

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '1.5rem' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#207652', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
