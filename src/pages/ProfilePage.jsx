import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/api/client'
import {
  User, Mail, Building2, Shield, Save, KeyRound,
  Eye, EyeOff, CheckCircle, Phone, AlertCircle,
  Heart, Stethoscope, Truck, Star,
} from 'lucide-react'

const ROLE_LABELS = {
  health_worker:  'Health Worker',
  facility_admin: 'Facility Admin',
  specialist:     'Specialist',
  driver:         'Driver',
  superadmin:     'Superadmin',
  patient:        'Patient',
}

const ROLE_COLORS = {
  health_worker:  { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', accent: '#207652' },
  facility_admin: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', accent: '#2563eb' },
  specialist:     { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', accent: '#7c3aed' },
  driver:         { bg: '#fffbeb', color: '#92400e', border: '#fde68a', accent: '#d97706' },
  superadmin:     { bg: '#fff1f2', color: '#9f1239', border: '#fecdd3', accent: '#e43418' },
  patient:        { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', accent: '#16a34a' },
}

const ROLE_ICONS = {
  health_worker:  Heart,
  facility_admin: Building2,
  specialist:     Stethoscope,
  driver:         Truck,
  superadmin:     Shield,
  patient:        Star,
}

// ── Input styles ──────────────────────────────────────────────────────────────
const inp = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '10px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white', color: '#0f172a',
  transition: 'border-color 0.15s',
}
const inpDisabled = {
  ...inp, background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed',
}
const label = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600,
  color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type = 'success' }) {
  return (
    <div style={{
      position: 'fixed', bottom: '88px', right: '24px', zIndex: 9999,
      background: type === 'success' ? '#207652' : '#c02812',
      color: 'white', borderRadius: '12px', padding: '12px 20px',
      fontSize: '0.875rem', fontWeight: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', gap: '8px',
      animation: 'slideUp 0.3s ease', maxWidth: '320px',
    }}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  )
}

// ── Field with icon ───────────────────────────────────────────────────────────
function IconField({ icon: Icon, children, hint }) {
  return (
    <div>
      {children}
      {hint && <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>{hint}</p>}
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, iconBg, iconColor, title, subtitle, children }) {
  return (
    <div style={{
      background: 'white', borderRadius: '16px', padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px' }}>
        <div style={{ width: '36px', height: '36px', background: iconBg, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={17} color={iconColor} />
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{title}</p>
          {subtitle && <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', marginTop: '1px' }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user } = useAuth()

  const [profile, setProfile]      = useState({ name: '', email: '', phone_number: '' })
  const [savingProfile, setSaving] = useState(false)
  const [profileDirty, setDirty]   = useState(false)

  const [passwords, setPasswords]  = useState({ current: '', new1: '', new2: '' })
  const [showPw, setShowPw]        = useState({ current: false, new1: false, new2: false })
  const [savingPw, setSavingPw]    = useState(false)
  const [pwErrors, setPwErrors]    = useState({})

  const [toast, setToast]          = useState(null)

  useEffect(() => {
    if (user) setProfile({
      name:         user.name         || '',
      email:        user.email        || '',
      phone_number: user.phone_number || '',
    })
  }, [user])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleProfileChange = (k) => (e) => {
    setProfile(p => ({ ...p, [k]: e.target.value }))
    setDirty(true)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!profile.name.trim()) return
    setSaving(true)
    try {
      await authApi.updateMe({
        name:         profile.name.trim(),
        email:        profile.email.trim(),
        phone_number: profile.phone_number.trim(),
      })
      setDirty(false)
      showToast('Profile updated successfully')
    } catch (err) {
      const d = err?.response?.data
      const msg = d ? Object.values(d).flat().join(' ') : 'Failed to update profile.'
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const validatePasswords = () => {
    const errs = {}
    if (!passwords.current)            errs.current = 'Required'
    if (passwords.new1.length < 8)     errs.new1    = 'Minimum 8 characters'
    if (passwords.new1 !== passwords.new2) errs.new2 = 'Passwords do not match'
    return errs
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    const errs = validatePasswords()
    if (Object.keys(errs).length) { setPwErrors(errs); return }
    setPwErrors({})
    setSavingPw(true)
    try {
      await authApi.changePassword({
        current_password: passwords.current,
        new_password:     passwords.new1,
        new_password2:    passwords.new2,
      })
      setPasswords({ current: '', new1: '', new2: '' })
      showToast('Password changed successfully')
    } catch (err) {
      const d = err?.response?.data
      const msg = d ? Object.values(d).flat().join(' ') : 'Failed to change password.'
      showToast(msg, 'error')
    } finally {
      setSavingPw(false)
    }
  }

  if (!user) return null

  const roleStyle = ROLE_COLORS[user.role] || ROLE_COLORS.health_worker
  const RoleIcon  = ROLE_ICONS[user.role]  || Shield
  const initials  = (user.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const pwReady   = passwords.current && passwords.new1 && passwords.new2

  return (
    <div style={{ padding: '28px 24px', maxWidth: '700px', margin: '0 auto' }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity:0 } to { transform: translateY(0); opacity:1 } }
        input:focus { border-color: #207652 !important; box-shadow: 0 0 0 3px rgba(32,118,82,0.12); }
      `}</style>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>My Profile</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Manage your account information and security</p>
      </div>

      {/* ── Identity card ─────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${roleStyle.accent}15, ${roleStyle.accent}05)`,
        border: `1px solid ${roleStyle.border}`,
        borderRadius: '20px', padding: '24px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', gap: '20px',
      }}>
        {/* Avatar */}
        <div style={{
          width: '80px', height: '80px', borderRadius: '22px',
          background: `linear-gradient(135deg, ${roleStyle.accent}, ${roleStyle.accent}cc)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.6rem', fontWeight: 700, color: 'white', flexShrink: 0,
          boxShadow: `0 6px 20px ${roleStyle.accent}40`,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '1.2rem', color: '#0f172a', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name}
          </p>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              fontSize: '0.72rem', fontWeight: 600, padding: '4px 12px', borderRadius: '20px',
              background: roleStyle.bg, color: roleStyle.color, border: `1px solid ${roleStyle.border}`,
              display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              <RoleIcon size={11} /> {ROLE_LABELS[user.role] || user.role}
            </span>
            {user.facility_name && (
              <span style={{
                fontSize: '0.72rem', fontWeight: 500, padding: '4px 12px', borderRadius: '20px',
                background: 'white', color: '#475569', border: '1px solid #e2e8f0',
                display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}>
                <Building2 size={10} /> {user.facility_name}
              </span>
            )}
            {user.is_verified && (
              <span style={{
                fontSize: '0.72rem', fontWeight: 500, padding: '4px 12px', borderRadius: '20px',
                background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
                display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}>
                <CheckCircle size={10} /> Verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Personal Information ───────────────────────────────────────────── */}
      <SectionCard
        icon={User}
        iconBg="#f0fdf4"
        iconColor="#207652"
        title="Personal Information"
        subtitle="Update your name, email address, and phone number"
      >
        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Name */}
          <div>
            <label style={label}>Full Name</label>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                value={profile.name}
                onChange={handleProfileChange('name')}
                required
                style={{ ...inp, paddingLeft: '38px' }}
                placeholder="Your full name"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={label}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                type="email"
                value={profile.email}
                onChange={handleProfileChange('email')}
                required
                style={{ ...inp, paddingLeft: '38px' }}
                placeholder="your@email.com"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label style={label}>Phone Number</label>
            <div style={{ position: 'relative' }}>
              <Phone size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                type="tel"
                value={profile.phone_number}
                onChange={handleProfileChange('phone_number')}
                style={{ ...inp, paddingLeft: '38px' }}
                placeholder="+233 XX XXX XXXX"
              />
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
              Used for SMS notifications and emergency alerts
            </p>
          </div>

          {/* Role — read-only */}
          <div>
            <label style={label}>Role</label>
            <div style={{ position: 'relative' }}>
              <Shield size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                disabled
                value={ROLE_LABELS[user.role] || user.role}
                style={{ ...inpDisabled, paddingLeft: '38px' }}
              />
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
              Role changes must be made by a system administrator
            </p>
          </div>

          {/* Facility — read-only, if present */}
          {user.facility_name && (
            <div>
              <label style={label}>Assigned Facility</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                <input
                  disabled
                  value={user.facility_name}
                  style={{ ...inpDisabled, paddingLeft: '38px' }}
                />
              </div>
              <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                Facility assignment is managed by a facility administrator
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button
              type="submit"
              disabled={savingProfile || !profileDirty}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 22px',
                background: (!profileDirty || savingProfile) ? '#f1f5f9' : '#207652',
                color:      (!profileDirty || savingProfile) ? '#94a3b8' : 'white',
                border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600,
                cursor: (!profileDirty || savingProfile) ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <Save size={15} />
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* ── Change Password ────────────────────────────────────────────────── */}
      <SectionCard
        icon={KeyRound}
        iconBg="#fff7ed"
        iconColor="#ea580c"
        title="Change Password"
        subtitle="Choose a strong password with at least 8 characters"
      >
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            ['current', 'Current Password', 'Enter your current password'],
            ['new1',    'New Password',      'At least 8 characters'],
            ['new2',    'Confirm New Password', 'Re-enter your new password'],
          ].map(([key, lbl, ph]) => (
            <div key={key}>
              <label style={label}>{lbl}</label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                <input
                  type={showPw[key] ? 'text' : 'password'}
                  required
                  value={passwords[key]}
                  onChange={e => {
                    setPasswords(p => ({ ...p, [key]: e.target.value }))
                    if (pwErrors[key]) setPwErrors(p => ({ ...p, [key]: null }))
                  }}
                  placeholder={ph}
                  style={{
                    ...inp,
                    paddingLeft:  '38px',
                    paddingRight: '40px',
                    borderColor:  pwErrors[key] ? '#f87171' : '#e2e8f0',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => ({ ...p, [key]: !p[key] }))}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}
                >
                  {showPw[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {pwErrors[key] && (
                <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={11} /> {pwErrors[key]}
                </p>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button
              type="submit"
              disabled={savingPw || !pwReady}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 22px',
                background: (savingPw || !pwReady) ? '#f1f5f9' : '#ea580c',
                color:      (savingPw || !pwReady) ? '#94a3b8' : 'white',
                border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600,
                cursor: (savingPw || !pwReady) ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <KeyRound size={15} />
              {savingPw ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* ── Account Details — read-only info ──────────────────────────────── */}
      <SectionCard
        icon={Shield}
        iconBg="#f8fafc"
        iconColor="#64748b"
        title="Account Details"
        subtitle="Read-only system information about your account"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {[
            ['User ID',       user.id?.toString().slice(0, 8) + '…'],
            ['Account Status', user.is_active ? 'Active' : 'Inactive'],
            ['Verified',      user.is_verified ? 'Yes' : 'Pending verification'],
            ['Member Since',  user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{k}</p>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155', margin: 0 }}>{v}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
