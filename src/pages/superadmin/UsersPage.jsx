import { useState, useEffect, useCallback } from 'react'
import { usersApi, facilitiesApi } from '@/api/client'
import { PageSpinner, EmptyState, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { Users, Search, Building2, Mail, Clock, Plus, X, Save, Trash2, Edit2, KeyRound, Phone, CreditCard, CheckCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'

const ROLE_LABELS = {
  health_worker:  'Health Worker',
  facility_admin: 'Facility Admin',
  specialist:     'Specialist',
  driver:         'Driver',
  superadmin:     'Superadmin',
}

const ROLE_COLORS = {
  health_worker:  'bg-brand-100 text-brand-700',
  facility_admin: 'bg-blue-100 text-blue-700',
  specialist:     'bg-purple-100 text-purple-700',
  driver:         'bg-amber-100 text-amber-700',
  superadmin:     'bg-danger-100 text-danger-700',
}

const FACILITY_ROLES = ['health_worker', 'facility_admin']

const inp = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white',
}
const lbl = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: '#64748b', marginBottom: '6px',
}

const EMPTY_FORM = {
  name: '', email: '', role: 'health_worker', facility: '', password: '', password2: '', is_active: true, phone_number: '', license_number: '',
}

// ── User Modal (Create / Edit) ────────────────────────────────────────────────
function UserModal({ user, facilities, onClose, onSaved, currentUser }) {
  const isEdit = !!user
  const [form, setForm]     = useState(isEdit ? { ...user, password: '', password2: '', facility: user.facility || '' } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isFacilityAdmin = currentUser?.role === 'facility_admin'
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const voiceFields = [
    { key: 'name', label: 'Full Name', get: () => form.name, set: (v) => setForm(f => ({ ...f, name: v })) },
    ...(form.role === 'driver' ? [
      { key: 'phone_number', label: 'Phone Number', get: () => form.phone_number, set: (v) => setForm(f => ({ ...f, phone_number: v })) },
      { key: 'license_number', label: 'License Number', get: () => form.license_number, set: (v) => setForm(f => ({ ...f, license_number: v })) },
    ] : []),
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const needsFacility = FACILITY_ROLES.includes(form.role)

  // Facility admins can only assign users to their own facility
  useEffect(() => {
    if (isFacilityAdmin) setForm(f => ({ ...f, facility: currentUser.facility || '' }))
  }, [isFacilityAdmin, currentUser])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isEdit && form.password !== form.password2) { setError('Passwords do not match.'); return }
    if (!isEdit && form.password.length < 8)         { setError('Password must be at least 8 characters.'); return }

    setSaving(true)
    try {
      const payload = {
        name:      form.name.trim(),
        email:     form.email.trim(),
        role:      form.role,
        is_active: form.is_active,
        ...(needsFacility && form.facility && { facility: form.facility }),
        ...(form.role === 'driver' && form.phone_number   && { phone_number:   form.phone_number.trim() }),
        ...(form.role === 'driver' && form.license_number && { license_number: form.license_number.trim() }),
      }
      if (!isEdit) {
        payload.password  = form.password
        payload.password2 = form.password2
      }

      let saved
      if (isEdit) {
        const { data } = await usersApi.update(user.id, payload)
        saved = data
      } else {
        const { data } = await usersApi.create(payload)
        saved = data
      }
      onSaved(saved, isEdit)
    } catch (err) {
      const d = err?.response?.data
      if (d && typeof d === 'object') {
        setError(Object.values(d).flat().join(' · '))
      } else {
        setError('Failed to save user. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  // Roles facility_admin can assign (not superadmin)
  const availableRoles = isFacilityAdmin
    ? Object.entries(ROLE_LABELS).filter(([v]) => v !== 'superadmin')
    : Object.entries(ROLE_LABELS)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px rgba(0,0,0,0.35)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>{isEdit ? 'Edit User' : 'Create New User'}</h2>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>{isEdit ? `Editing ${user.name}` : 'Add a new platform user'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '10px 14px', color: '#c02812', fontSize: '0.82rem' }}>{error}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} className="mb-2" />
                <label style={lbl}>Full Name *</label>
                <input required value={form.name} onChange={set('name')} style={inp} placeholder="Full name" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Email *</label>
                <input required type="email" value={form.email} onChange={set('email')} style={inp} placeholder="user@facility.gh" />
              </div>
              <div>
                <label style={lbl}>Role *</label>
                <select value={form.role} onChange={set('role')} style={inp}>
                  {availableRoles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))} style={inp}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              {needsFacility && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Facility *</label>
                  {isFacilityAdmin ? (
                    <input disabled value={currentUser.facility_name || 'Your facility'} style={{ ...inp, background: '#f8fafc', color: '#94a3b8' }} />
                  ) : (
                    <select required value={form.facility} onChange={set('facility')} style={inp}>
                      <option value="">— Select facility —</option>
                      {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  )}
                </div>
              )}
              {/* Driver-specific fields */}
              {form.role === 'driver' && (
                <>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={lbl}>Phone Number {!isEdit && <span style={{ color: '#e43418' }}>*</span>}</label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        required={!isEdit}
                        value={form.phone_number} onChange={set('phone_number')}
                        placeholder="+233..."
                        style={{ ...inp, paddingLeft: '36px' }}
                      />
                    </div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={lbl}>License Number <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                    <div style={{ position: 'relative' }}>
                      <CreditCard size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        value={form.license_number} onChange={set('license_number')}
                        placeholder="e.g. GH-1234-2020"
                        style={{ ...inp, paddingLeft: '36px' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {!isEdit && (
                <>
                  <div>
                    <label style={lbl}>Password *</label>
                    <input required type="password" minLength={8} value={form.password} onChange={set('password')} style={inp} placeholder="Min. 8 characters" />
                  </div>
                  <div>
                    <label style={lbl}>Confirm Password *</label>
                    <input required type="password" value={form.password2} onChange={set('password2')} style={inp} placeholder="Repeat password" />
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', padding: '16px 24px', borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', color: '#475569' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', background: saving ? '#7cb99a' : '#207652', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? <><Spinner size={14} /> Saving…</> : <><Save size={14} /> {isEdit ? 'Save Changes' : 'Create User'}</>}
            </button>
          </div>
        </form>
        <VoiceEntryBar voiceEntry={voiceEntry} />
      </div>
    </div>
  )
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
function DeleteModal({ user, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')
  const [hardDelete, setHardDelete] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      const response = await usersApi.delete(user.id, hardDelete ? { hard: true } : undefined)
      // Backend returns 200 for soft-delete (deactivated) or 204 for hard delete.
      // Both mean success — remove the user from the list either way.
      if (response.status === 200 || response.status === 204) {
        onDeleted(user.id)
      }
    } catch (err) {
      const d = err?.response?.data
      setError(
        (d && typeof d === 'object' ? Object.values(d).flat().join(' ') : null) ||
        `Failed to ${hardDelete ? 'delete' : 'deactivate'} user. Please try again.`
      )
      setDeleting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '28px 24px', boxShadow: '0 25px 50px rgba(0,0,0,0.35)', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: '52px', height: '52px', background: '#fff1f2', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Trash2 size={22} color="#c02812" />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
          {hardDelete ? `Permanently delete ${user.name}?` : `Deactivate ${user.name}?`}
        </h3>
        {hardDelete ? (
          <p style={{ margin: '0 0 6px', fontSize: '0.875rem', color: '#64748b' }}>
            This removes the account row entirely. It fails safely if they created any emergency cases
            or triage notes — those clinical records can never be deleted out from under a case history.
          </p>
        ) : (
          <p style={{ margin: '0 0 6px', fontSize: '0.875rem', color: '#64748b' }}>
            The user will lose access immediately. Their clinical records will be preserved.
          </p>
        )}
        <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: '#94a3b8' }}>
          {hardDelete ? 'This cannot be undone.' : 'This can be undone by editing the user and setting their status back to Active.'}
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#c02812', marginBottom: '18px', cursor: 'pointer', textAlign: 'left' }}>
          <input type="checkbox" checked={hardDelete} onChange={e => setHardDelete(e.target.checked)} />
          Permanently delete instead of deactivating
        </label>

        {error && <p style={{ color: '#c02812', fontSize: '0.82rem', marginBottom: '12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', color: '#475569' }}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '10px', background: deleting ? '#f87171' : '#c02812', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer' }}>
            {deleting ? (hardDelete ? 'Deleting…' : 'Deactivating…') : (hardDelete ? 'Yes, Permanently Delete' : 'Yes, Deactivate')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: currentUser, isSuperAdmin, isFacilityAdmin } = useAuth()
  const canManage = isSuperAdmin || isFacilityAdmin

  const [users, setUsers]           = useState([])
  const [allUsers, setAllUsers]     = useState([])
  const [facilities, setFacilities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const [createModal, setCreateModal] = useState(false)
  const [editUser, setEditUser]       = useState(null)
  const [deleteUser, setDeleteUser]   = useState(null)

  // Load facilities for the create/edit modal
  useEffect(() => {
    if (canManage && isSuperAdmin) {
      facilitiesApi.list().then(({ data }) => setFacilities(Array.isArray(data) ? data : data.results || [])).catch(() => {})
    }
  }, [canManage, isSuperAdmin])

  useEffect(() => {
    usersApi.list().then(({ data }) => setAllUsers(Array.isArray(data) ? data : data.results || [])).catch(() => {})
  }, [])

  const fetchUsers = useCallback(() => {
    setLoading(true)
    setError('')
    const params = {}
    if (search)     params.search = search
    if (roleFilter) params.role   = roleFilter
    usersApi.list(params)
      .then(({ data }) => setUsers(Array.isArray(data) ? data : data.results || []))
      .catch(() => setError('Could not load users.'))
      .finally(() => setLoading(false))
  }, [search, roleFilter])

  useEffect(() => {
    const t = setTimeout(fetchUsers, 350)
    return () => clearTimeout(t)
  }, [fetchUsers])

  const handleSaved = (savedUser, isEdit) => {
    if (isEdit) {
      setUsers(prev => prev.map(u => u.id === savedUser.id ? savedUser : u))
      setAllUsers(prev => prev.map(u => u.id === savedUser.id ? savedUser : u))
      setEditUser(null)
    } else {
      setUsers(prev => [savedUser, ...prev])
      setAllUsers(prev => [savedUser, ...prev])
      setCreateModal(false)
    }
  }

  const handleDeleted = (id) => {
    setUsers(prev => prev.filter(u => u.id !== id))
    setAllUsers(prev => prev.filter(u => u.id !== id))
    setDeleteUser(null)
  }

  const [approvingId, setApprovingId] = useState(null)
  const handleApprove = async (u) => {
    setApprovingId(u.id)
    try {
      const { data } = await usersApi.approve(u.id)
      setUsers(prev => prev.map(x => x.id === u.id ? data : x))
      setAllUsers(prev => prev.map(x => x.id === u.id ? data : x))
    } catch {
      setError('Could not approve this user. Please try again.')
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Users</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isFacilityAdmin ? 'Users at your facility' : 'All platform users'}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setCreateModal(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> New User
          </button>
        )}
      </div>

      {error && (
        <div className="card px-5 py-3 border-l-4 border-danger-400">
          <p className="text-sm text-danger-600">{error}</p>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search by name or email..." />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Role breakdown */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {Object.entries(ROLE_LABELS).map(([role, label]) => {
          const count = allUsers.filter(u => u.role === role).length
          return (
            <button key={role} onClick={() => setRoleFilter(r => r === role ? '' : role)}
              className={clsx('card px-3 py-3 text-center transition-all', roleFilter === role ? 'ring-2 ring-brand-400' : 'hover:shadow-card-hover')}>
              <p className="text-xl font-semibold text-slate-900">{count}</p>
              <span className={clsx('inline-block text-[10px] px-1.5 py-0.5 rounded font-medium mt-1', ROLE_COLORS[role])}>{label}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <PageSpinner />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Try adjusting your search or filters" />
      ) : (
        <div className="card divide-y divide-slate-50">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white font-semibold shrink-0">
                {u.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                  <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', ROLE_COLORS[u.role])}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                  {!u.is_active && <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">Inactive</span>}
                  {u.role !== 'patient' && u.role !== 'superadmin' && !u.is_approved && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Pending Approval</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <p className="text-xs text-slate-400 flex items-center gap-1"><Mail size={10} /> {u.email}</p>
                  {u.facility_name && <p className="text-xs text-slate-400 flex items-center gap-1"><Building2 size={10} /> {u.facility_name}</p>}
                  <p className="text-xs text-slate-400 flex items-center gap-1"><Clock size={10} /> {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</p>
                </div>
              </div>

              {/* Action buttons — only for managers */}
              {canManage && (
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {u.role !== 'patient' && u.role !== 'superadmin' && !u.is_approved && (
                    <button onClick={() => handleApprove(u)} disabled={approvingId === u.id} title="Approve user"
                      style={{ width: '32px', height: '32px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: approvingId === u.id ? 'not-allowed' : 'pointer', color: '#a16207' }}>
                      <CheckCircle size={14} />
                    </button>
                  )}
                  <button onClick={() => setEditUser(u)} title="Edit user"
                    style={{ width: '32px', height: '32px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#207652' }}>
                    <Edit2 size={14} />
                  </button>
                  {isSuperAdmin && (
                    <button onClick={() => setDeleteUser(u)} title="Delete user"
                      style={{ width: '32px', height: '32px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#c02812' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {createModal && (
        <UserModal facilities={facilities} onClose={() => setCreateModal(false)} onSaved={handleSaved} currentUser={currentUser} />
      )}
      {editUser && (
        <UserModal user={editUser} facilities={facilities} onClose={() => setEditUser(null)} onSaved={handleSaved} currentUser={currentUser} />
      )}
      {deleteUser && (
        <DeleteModal user={deleteUser} onClose={() => setDeleteUser(null)} onDeleted={handleDeleted} />
      )}
    </div>
  )
}
