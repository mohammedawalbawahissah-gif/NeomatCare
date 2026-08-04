import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/api/client'
import { User, Mail, Building2, Shield, Save, KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react'

const ROLE_LABELS = {
  health_worker:  'Health Worker',
  facility_admin: 'Facility Admin',
  specialist:     'Specialist',
  driver:         'Driver',
  superadmin:     'Superadmin',
}

const ROLE_COLORS = {
  health_worker:  { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  facility_admin: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  specialist:     { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' },
  driver:         { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  superadmin:     { bg: '#fff1f2', color: '#9f1239', border: '#fecdd3' },
}

const inp = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white', color: '#0f172a',
}
const label = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
}

function Toast({ message, type = 'success' }) {
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: type === 'success' ? '#207652' : '#c02812',
      color: 'white', borderRadius: '12px', padding: '12px 20px',
      fontSize: '0.875rem', fontWeight: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', gap: '8px',
      animation: 'slideUp 0.3s ease',
    }}>
      <CheckCircle size={16} />
      {message}
    </div>
  )
}

export default function ProfilePage() {
  const { user, login } = useAuth()

  const [profile, setProfile]       = useState({ name: '', email: '' })
  const [savingProfile, setSaving]  = useState(false)
  const [profileDirty, setDirty]    = useState(false)

  const [passwords, setPasswords]   = useState({ current: '', new1: '', new2: '' })
  const [showPw, setShowPw]         = useState(false)
  const [savingPw, setSavingPw]     = useState(false)

  const [toast, setToast]           = useState(null)

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', email: user.email || '' })
  }, [user])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
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
      await authApi.updateMe({ name: profile.name.trim(), email: profile.email.trim() })
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

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (passwords.new1 !== passwords.new2) { showToast('New passwords do not match.', 'error'); return }
    if (passwords.new1.length < 8)         { showToast('Password must be at least 8 characters.', 'error'); return }
    setSavingPw(true)
    try {
      await authApi.changePassword({ current_password: passwords.current, new_password: passwords.new1, new_password2: passwords.new2 })
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
  const initials  = (user.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      <style>{`@keyframes slideUp { from { transform: translateY(16px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>My Profile</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>Manage your account information and password</p>
      </div>

      {/* Avatar + role card */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'linear-gradient(135deg, #207652, #2f9466)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: 'white', flexShrink: 0, boxShadow: '0 4px 12px rgba(32,118,82,0.3)' }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a', margin: '0 0 4px' }}>{user.name}</p>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>{user.email}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: roleStyle.bg, color: roleStyle.color, border: `1px solid ${roleStyle.border}` }}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
            {user.facility_name && (
              <span style={{ fontSize: '0.72rem', fontWeight: 500, padding: '3px 10px', borderRadius: '20px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Building2 size={10} /> {user.facility_name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{ width: '32px', height: '32px', background: '#f0fdf4', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={16} color="#207652" />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>Personal Information</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Update your name and email address</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={label}>Full Name</label>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={profile.name} onChange={handleProfileChange('name')} required style={{ ...inp, paddingLeft: '36px' }} placeholder="Your full name" />
            </div>
          </div>
          <div>
            <label style={label}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="email" value={profile.email} onChange={handleProfileChange('email')} required style={{ ...inp, paddingLeft: '36px' }} placeholder="your@email.com" />
            </div>
          </div>
          <div>
            <label style={label}>Role</label>
            <div style={{ position: 'relative' }}>
              <Shield size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input disabled value={ROLE_LABELS[user.role] || user.role} style={{ ...inp, paddingLeft: '36px', background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }} />
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>Role can only be changed by an administrator</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={savingProfile || !profileDirty}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: (!profileDirty || savingProfile) ? '#e2e8f0' : '#207652', color: (!profileDirty || savingProfile) ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: (!profileDirty || savingProfile) ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
              <Save size={15} /> {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{ width: '32px', height: '32px', background: '#fff7ed', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={16} color="#ea580c" />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>Change Password</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Choose a strong password with at least 8 characters</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            ['current', 'Current Password'],
            ['new1',    'New Password'],
            ['new2',    'Confirm New Password'],
          ].map(([key, lbl]) => (
            <div key={key}>
              <label style={label}>{lbl}</label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type={showPw ? 'text' : 'password'} required
                  value={passwords[key]}
                  onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={key === 'current' ? 'Enter current password' : 'Min. 8 characters'}
                  style={{ ...inp, paddingLeft: '36px', paddingRight: '40px' }}
                />
                {key === 'new2' && (
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={savingPw || !passwords.current || !passwords.new1 || !passwords.new2}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: (savingPw || !passwords.current || !passwords.new1 || !passwords.new2) ? '#e2e8f0' : '#ea580c', color: (savingPw || !passwords.current || !passwords.new1 || !passwords.new2) ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: (savingPw || !passwords.current) ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
              <KeyRound size={15} /> {savingPw ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
