import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi, facilitiesApi } from '@/api/client'
import { Heart, Eye, EyeOff, ArrowRight, CheckCircle, Mail, Lock, User, Shield, Building2, Phone, CreditCard } from 'lucide-react'

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white',
}
const labelStyle = {
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

export default function RegisterPage() {
  const navigate = useNavigate()

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
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setFacilitiesLoading(true)
    setFacilitiesError(false)
    facilitiesApi.list()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data.results || [])
        setFacilities(list)
      })
      .catch(() => setFacilitiesError(true))
      .finally(() => setFacilitiesLoading(false))
  }, [])

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const needsFacility = FACILITY_REQUIRED.includes(form.role)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.password2) { setError('Passwords do not match.'); return }
    if (needsFacility && !form.facility)  { setError('Please select a facility.'); return }

    setLoading(true)
    try {
      const payload = {
        name:      form.name,
        email:     form.email,
        password:  form.password,
        password2: form.password2,
        role:      form.role,
        ...(needsFacility && { facility: form.facility }),
        ...(form.role === 'driver' && form.phone_number   && { phone_number:   form.phone_number }),
        ...(form.role === 'driver' && form.license_number && { license_number: form.license_number }),
      }
      await authApi.register(payload)
      setSuccess(true)
      setTimeout(() => navigate('/login?registered=1'), 2500)
    } catch (err) {
      const data = err?.response?.data
      if (data && typeof data === 'object') {
        const firstKey = Object.keys(data)[0]
        const msg = Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey]
        setError(msg || 'Registration failed.')
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b,#0a2319)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '18px', padding: '3rem 2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.4)', textAlign: 'center', maxWidth: '380px', width: '100%' }}>
          <CheckCircle size={52} color="#207652" style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', color: '#0f172a', marginBottom: '0.5rem' }}>Account Created!</h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Redirecting you to sign in…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b,#0a2319)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Header — identical to LoginPage */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '56px', height: '56px', background: '#2f9466', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 10px 25px rgba(47,148,102,0.35)' }}>
            <Heart size={24} color="white" fill="white" />
          </div>
          <h1 style={{ color: 'white', fontFamily: 'Georgia, serif', fontSize: '1.9rem', margin: 0 }}>NeoMatCare</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.35rem' }}>Emergency Referral System</p>
        </div>

        {/* Card */}
        <div style={{ background: 'white', borderRadius: '18px', padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.4)' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', color: '#0f172a', marginBottom: '0.25rem' }}>Create account</h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Join the NeoMatCare platform</p>

          {error && (
            <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '0.75rem 1rem', color: '#c02812', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Full Name */}
            <div>
              <label style={labelStyle}>Full Name <span style={{ color: '#e43418' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  required value={form.name} onChange={set('name')}
                  placeholder="e.g. Ama Owusu"
                  style={{ ...inputStyle, paddingLeft: '38px' }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email Address <span style={{ color: '#e43418' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="email" required value={form.email} onChange={set('email')}
                  placeholder="you@facility.gh"
                  style={{ ...inputStyle, paddingLeft: '38px' }}
                />
              </div>
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role <span style={{ color: '#e43418' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                <select value={form.role} onChange={set('role')} style={{ ...inputStyle, paddingLeft: '38px', cursor: 'pointer' }}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            {/* Facility — only for health_worker / facility_admin */}
            {needsFacility && (
              <div>
                <label style={labelStyle}>Facility <span style={{ color: '#e43418' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <Building2 size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                  {facilitiesLoading ? (
                    <input disabled placeholder="Loading facilities…" style={{ ...inputStyle, paddingLeft: '38px', color: '#94a3b8' }} />
                  ) : facilitiesError ? (
                    <input disabled placeholder="Could not load facilities — refresh page" style={{ ...inputStyle, paddingLeft: '38px', color: '#c02812' }} />
                  ) : (
                    <select required value={form.facility} onChange={set('facility')} style={{ ...inputStyle, paddingLeft: '38px', cursor: 'pointer' }}>
                      <option value="">— Select a facility —</option>
                      {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Driver-specific fields */}
            {form.role === 'driver' && (
              <>
                <div>
                  <label style={labelStyle}>Phone Number <span style={{ color: '#e43418' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      required value={form.phone_number} onChange={set('phone_number')}
                      placeholder="+233..."
                      style={{ ...inputStyle, paddingLeft: '38px' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>License Number <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ position: 'relative' }}>
                    <CreditCard size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      value={form.license_number} onChange={set('license_number')}
                      placeholder="e.g. GH-1234-2020"
                      style={{ ...inputStyle, paddingLeft: '38px' }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label style={labelStyle}>Password <span style={{ color: '#e43418' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type={showPw ? 'text' : 'password'} required minLength={8}
                  value={form.password} onChange={set('password')}
                  placeholder="Min. 8 characters"
                  style={{ ...inputStyle, paddingLeft: '38px', paddingRight: '40px' }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label style={labelStyle}>Confirm Password <span style={{ color: '#e43418' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={form.password2} onChange={set('password2')}
                  placeholder="Repeat your password"
                  style={{ ...inputStyle, paddingLeft: '38px' }}
                />
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: loading ? '#7cb99a' : '#207652', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '6px' }}>
              {loading ? 'Creating account…' : <><span>Create Account</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b', marginTop: '1.5rem' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#207652', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
