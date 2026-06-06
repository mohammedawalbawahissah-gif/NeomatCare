import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { publicApi, facilitiesApi } from '@/api/client'
import {
  Heart, Eye, EyeOff, ArrowRight, CheckCircle,
  Mail, Lock, User, Shield, Building2, Phone, CreditCard, ShieldCheck,
} from 'lucide-react'

const inp = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white',
}
const lbl = {
  display: 'block', fontSize: '0.875rem',
  fontWeight: 500, color: '#374151', marginBottom: '6px',
}

const ROLES = [
  { value: 'health_worker',  label: 'Health Worker' },
  { value: 'facility_admin', label: 'Facility Admin' },
  { value: 'specialist',     label: 'Specialist' },
  { value: 'driver',         label: 'Driver' },
]

const FACILITY_REQUIRED = ['health_worker', 'facility_admin']
const PHONE_REQUIRED    = ['driver', 'specialist']

// ── Shared layout components ──────────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b,#0a2319)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '56px', height: '56px', background: '#2f9466', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 10px 25px rgba(47,148,102,0.35)' }}>
            <Heart size={24} color="white" fill="white" />
          </div>
          <h1 style={{ color: 'white', fontFamily: 'Georgia, serif', fontSize: '1.9rem', margin: 0 }}>NeoMatCare</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.35rem' }}>Emergency Referral System</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function Card({ children }) {
  return (
    <div style={{ background: 'white', borderRadius: '18px', padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.4)' }}>
      {children}
    </div>
  )
}

function ErrorBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '0.75rem 1rem', color: '#c02812', fontSize: '0.875rem', marginBottom: '1rem' }}>
      {msg}
    </div>
  )
}

function SuccessBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background: '#f0fdf4', border: '1px solid #bbe3ce', borderRadius: '8px', padding: '0.75rem 1rem', color: '#1a5e42', fontSize: '0.875rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <CheckCircle size={15} /> {msg}
    </div>
  )
}

function SubmitBtn({ loading, disabled, label, loadingLabel }) {
  return (
    <button type="submit" disabled={loading || disabled}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: (loading || disabled) ? '#7cb99a' : '#207652', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: (loading || disabled) ? 'not-allowed' : 'pointer', marginTop: '6px', width: '100%' }}>
      {loading ? loadingLabel : <><span>{label}</span><ArrowRight size={16} /></>}
    </button>
  )
}

function Field({ label, icon: Icon, children, hint }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />}
        {children}
      </div>
      {hint && <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>{hint}</p>}
    </div>
  )
}

// ── OTP Step ──────────────────────────────────────────────────────────────────
function OTPStep({ userId, phone, onVerified }) {
  const [otp,     setOtp]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [resent,  setResent]  = useState(false)

  const handleVerify = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await publicApi.post('/api/auth/verify/', { user_id: userId, otp_code: otp })
      onVerified(data)
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

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ width: '52px', height: '52px', background: '#f0fdf4', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
          <ShieldCheck size={24} color="#207652" />
        </div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', color: '#0f172a', marginBottom: '0.25rem' }}>Verify your account</h2>
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
        <SubmitBtn loading={loading} disabled={otp.length < 6} label="Verify & Continue" loadingLabel="Verifying…" />
      </form>

      <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '1.25rem' }}>
        Didn't receive a code?{' '}
        <button onClick={handleResend} style={{ background: 'none', border: 'none', color: '#207652', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
          Resend
        </button>
      </p>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const navigate = useNavigate()

  const [step,   setStep]   = useState('register')   // 'register' | 'verify'
  const [userId, setUserId] = useState('')
  const [phone,  setPhone]  = useState('')

  const [form, setForm] = useState({
    name: '', email: '', password: '', password2: '',
    role: 'health_worker', facility: '',
    phone_number: '', license_number: '',
  })

  const [facilities,        setFacilities]        = useState([])
  const [facilitiesLoading, setFacilitiesLoading] = useState(true)
  const [facilitiesError,   setFacilitiesError]   = useState(false)
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    facilitiesApi.list()
      .then(({ data }) => setFacilities(Array.isArray(data) ? data : data.results || []))
      .catch(() => setFacilitiesError(true))
      .finally(() => setFacilitiesLoading(false))
  }, [])

  const set         = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const needsFacility = FACILITY_REQUIRED.includes(form.role)
  const needsPhone    = PHONE_REQUIRED.includes(form.role)

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.password2) { setError('Passwords do not match.'); return }
    if (needsFacility && !form.facility)  { setError('Please select a facility.'); return }
    if (needsPhone && !form.phone_number) { setError('Phone number is required for your role.'); return }

    setLoading(true)
    try {
      const payload = {
        name: form.name, email: form.email,
        password: form.password, password2: form.password2,
        role: form.role,
        ...(form.phone_number   && { phone_number:   form.phone_number }),
        ...(needsFacility        && { facility:        form.facility }),
        ...(form.license_number && { license_number: form.license_number }),
      }
      const { data } = await publicApi.post('/api/auth/register/', payload)
      setUserId(data.user_id)
      setPhone(form.phone_number)
      setStep('verify')
    } catch (err) {
      const d = err?.response?.data
      if (d && typeof d === 'object') {
        setError(Object.values(d).flat().join(' '))
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally { setLoading(false) }
  }

  const handleVerified = (data) => {
    localStorage.setItem('access_token',  data.access)
    localStorage.setItem('refresh_token', data.refresh)
    window.location.href = '/app/dashboard'
  }

  return (
    <PageShell>
      <Card>
        {step === 'register' ? (
          <>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', color: '#0f172a', marginBottom: '0.25rem' }}>Create account</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Join the NeoMatCare platform</p>

            <ErrorBox msg={error} />

            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <Field label={<>Full Name <span style={{ color: '#e43418' }}>*</span></>} icon={User}>
                <input required value={form.name} onChange={set('name')} placeholder="e.g. Kwame Asante" style={{ ...inp, paddingLeft: '38px' }} />
              </Field>

              <Field label={<>Email Address <span style={{ color: '#e43418' }}>*</span></>} icon={Mail}>
                <input type="email" required value={form.email} onChange={set('email')} placeholder="you@facility.gh" style={{ ...inp, paddingLeft: '38px' }} />
              </Field>

              <Field label={<>Role <span style={{ color: '#e43418' }}>*</span></>} icon={Shield}>
                <select value={form.role} onChange={set('role')} style={{ ...inp, paddingLeft: '38px', cursor: 'pointer' }}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>

              {needsFacility && (
                <Field label={<>Facility <span style={{ color: '#e43418' }}>*</span></>} icon={Building2}>
                  {facilitiesLoading ? (
                    <input disabled placeholder="Loading facilities…" style={{ ...inp, paddingLeft: '38px', color: '#94a3b8' }} />
                  ) : facilitiesError ? (
                    <input disabled placeholder="Could not load facilities — refresh page" style={{ ...inp, paddingLeft: '38px', color: '#c02812' }} />
                  ) : (
                    <select required value={form.facility} onChange={set('facility')} style={{ ...inp, paddingLeft: '38px', cursor: 'pointer' }}>
                      <option value="">— Select a facility —</option>
                      {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  )}
                </Field>
              )}

              <Field
                label={<>Phone Number {needsPhone ? <span style={{ color: '#e43418' }}>*</span> : <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>}</>}
                icon={Phone}
                hint="A verification code will be sent to this number"
              >
                <input
                  required={needsPhone}
                  value={form.phone_number} onChange={set('phone_number')}
                  placeholder="+233 20 000 0000"
                  style={{ ...inp, paddingLeft: '38px' }}
                />
              </Field>

              {form.role === 'driver' && (
                <Field label={<>License Number <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></>} icon={CreditCard}>
                  <input value={form.license_number} onChange={set('license_number')} placeholder="e.g. GH-1234-2020" style={{ ...inp, paddingLeft: '38px' }} />
                </Field>
              )}

              <Field label={<>Password <span style={{ color: '#e43418' }}>*</span></>} icon={Lock}>
                <input
                  type={showPw ? 'text' : 'password'} required minLength={8}
                  value={form.password} onChange={set('password')}
                  placeholder="Min. 8 characters"
                  style={{ ...inp, paddingLeft: '38px', paddingRight: '40px' }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </Field>

              <Field label={<>Confirm Password <span style={{ color: '#e43418' }}>*</span></>} icon={Lock}>
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={form.password2} onChange={set('password2')}
                  placeholder="Repeat your password"
                  style={{ ...inp, paddingLeft: '38px' }}
                />
              </Field>

              <SubmitBtn loading={loading} label="Create Account" loadingLabel="Creating account…" />
            </form>
          </>
        ) : (
          <OTPStep userId={userId} phone={phone} onVerified={handleVerified} />
        )}

        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '1.5rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#207652', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
        </p>
      </Card>
    </PageShell>
  )
}
