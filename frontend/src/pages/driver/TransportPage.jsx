import { useState, useEffect } from 'react'
import { transportApi, usersApi } from '@/api/client'
import { PageSpinner, StatusBadge, Spinner } from '@/components/ui'
import { Plus, X, Pencil, Trash2, Phone } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'

// Vehicle type values match backend Vehicle.VehicleType choices
const TYPE_ICONS = {
  ambulance:  '🚑',
  car:        '🚗',
  motorcycle: '🏍️',
  tricycle:   '🛺',
  truck:      '🚛',
  other:      '🚐',
}

const TYPE_OPTIONS = [
  { value: 'ambulance',  label: 'Ambulance' },
  { value: 'car',        label: 'Car (Uber/Bolt/Yango)' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'tricycle',   label: 'Tricycle (Yellow-Yellow/MotorKing)' },
  { value: 'truck',      label: 'Truck' },
  { value: 'other',      label: 'Other' },
]

// Status values match Vehicle.Status choices
const VEHICLE_STATUS_OPTIONS = [
  { value: 'available',   label: 'Available' },
  { value: 'in_use',      label: 'In Use' },
  { value: 'maintenance', label: 'Under Maintenance' },
  { value: 'inactive',    label: 'Inactive' },
]

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
  borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
  boxSizing: 'border-box', background: 'white',
}
const labelStyle = { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }
const gridStyle  = (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px', marginBottom: '12px' })

// ── Register Vehicle Modal ────────────────────────────────────────────────────
// Fields match backend Vehicle model: registration, vehicle_type, make, model,
// year, status, driver (FK → Driver model, not User), notes
function RegisterVehicleModal({ open, onClose, onCreated }) {
  const [drivers, setDrivers] = useState([])
  const [form, setForm] = useState({
    registration: '',
    vehicle_type: 'ambulance',
    make:   '',
    model:  '',
    year:   '',
    status: 'available',
    driver: '',
    notes:  '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const voiceFields = [
    { key: 'registration', label: 'Registration Number', get: () => form.registration, set: (v) => setForm(f => ({ ...f, registration: v })) },
    { key: 'make', label: 'Make', get: () => form.make, set: (v) => setForm(f => ({ ...f, make: v })) },
    { key: 'model', label: 'Model', get: () => form.model, set: (v) => setForm(f => ({ ...f, model: v })) },
    { key: 'notes', label: 'Notes', get: () => form.notes, set: (v) => setForm(f => ({ ...f, notes: v })) },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const [driverUsers, setDriverUsers] = useState([])

  useEffect(() => {
    if (!open) return
    usersApi.list({ role: 'driver' })
      .then(({ data }) => setDriverUsers(Array.isArray(data) ? data : data.results || []))
      .catch(() => {})
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      // Strip empty optional fields; keep required ones
      const payload = Object.fromEntries(
        Object.entries({
          registration: form.registration,
          vehicle_type: form.vehicle_type,
          status:       form.status,
          ...(form.make   && { make:   form.make }),
          ...(form.model  && { model:  form.model }),
          ...(form.year   && { year:   Number(form.year) }),
          ...(form.driver && { driver: form.driver }),
          ...(form.notes  && { notes:  form.notes }),
        }).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      )
      const { data } = await transportApi.vehicles.create(payload)
      onCreated(data)
      onClose()
      setForm({ registration: '', vehicle_type: 'ambulance', make: '', model: '', year: '', status: 'available', driver: '', notes: '' })
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to register vehicle.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ position: 'relative', background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', margin: '40px auto', boxShadow: '0 25px 50px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f1f5f9', borderRadius: '16px 16px 0 0' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>Register Vehicle</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {error && <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '10px 14px', color: '#c02812', fontSize: '0.85rem', marginBottom: '16px' }}>{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 12px' }}>Vehicle Details</p>
            <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} className="mb-3" />
            <div style={gridStyle(2)}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Registration Number <span style={{ color: '#e43418' }}>*</span></label>
                <input required value={form.registration} onChange={set('registration')} placeholder="e.g. GR-1234-21" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Vehicle Type <span style={{ color: '#e43418' }}>*</span></label>
                <select value={form.vehicle_type} onChange={set('vehicle_type')} style={inputStyle}>
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={set('status')} style={inputStyle}>
                  {VEHICLE_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Make</label>
                <input value={form.make} onChange={set('make')} placeholder="e.g. Toyota" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input value={form.model} onChange={set('model')} placeholder="e.g. Land Cruiser" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Year</label>
                <input type="number" min={1990} max={2030} value={form.year} onChange={set('year')} placeholder="e.g. 2020" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>
                  Assign Driver <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                </label>
                <select value={form.driver} onChange={set('driver')} style={inputStyle}>
                  <option value="">— No driver assigned —</option>
                  {driverUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.email ? ` · ${u.email}` : ''}</option>
                  ))}
                </select>
                {driverUsers.length === 0 && (
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                    No driver accounts found. Register a user with role: Driver first.
                  </p>
                )}
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Notes</label>
                <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Any additional notes..." style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', color: '#475569' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px', background: saving ? '#7cb99a' : '#207652', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {saving ? <><Spinner size={14} className="text-white" />Registering…</> : 'Register Vehicle'}
              </button>
            </div>
          </form>
          <VoiceEntryBar voiceEntry={voiceEntry} />
        </div>
      </div>
    </div>
  )
}

// ── Edit Vehicle Modal ────────────────────────────────────────────────────────
function EditVehicleModal({ open, onClose, vehicle, onUpdated }) {
  const [drivers, setDrivers] = useState([])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (vehicle) setForm({ ...vehicle, driver: vehicle.driver || '', year: vehicle.year || '' })
  }, [vehicle])

  useEffect(() => {
    if (!open) return
    usersApi.list({ role: 'driver' })
      .then(({ data }) => setDrivers(Array.isArray(data) ? data : data.results || []))
      .catch(() => {})
  }, [open])

  const formSafe = form || {}
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const voiceFields = [
    { key: 'registration', label: 'Registration Number', get: () => formSafe.registration, set: (v) => setForm(f => ({ ...f, registration: v })) },
    { key: 'make', label: 'Make', get: () => formSafe.make, set: (v) => setForm(f => ({ ...f, make: v })) },
    { key: 'model', label: 'Model', get: () => formSafe.model, set: (v) => setForm(f => ({ ...f, model: v })) },
    { key: 'notes', label: 'Notes', get: () => formSafe.notes, set: (v) => setForm(f => ({ ...f, notes: v })) },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  if (!open || !form) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = {
        registration: form.registration,
        vehicle_type: form.vehicle_type,
        status:       form.status,
        ...(form.make   && { make:   form.make }),
        ...(form.model  && { model:  form.model }),
        ...(form.year   && { year:   Number(form.year) }),
        ...(form.driver && { driver: form.driver }),
        ...(form.notes  && { notes:  form.notes }),
      }
      const { data } = await transportApi.vehicles.update(vehicle.id, payload)
      onUpdated(data)
      onClose()
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to update vehicle.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ position: 'relative', background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', margin: '40px auto', boxShadow: '0 25px 50px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>Edit Vehicle</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {error && <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '10px 14px', color: '#c02812', fontSize: '0.85rem', marginBottom: '16px' }}>{error}</div>}
          <form onSubmit={handleSubmit} noValidate>
            <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} className="mb-3" />
            <div style={gridStyle(2)}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Registration Number <span style={{ color: '#e43418' }}>*</span></label>
                <input required value={form.registration} onChange={set('registration')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Vehicle Type <span style={{ color: '#e43418' }}>*</span></label>
                <select value={form.vehicle_type} onChange={set('vehicle_type')} style={inputStyle}>
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={set('status')} style={inputStyle}>
                  {VEHICLE_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Make</label>
                <input value={form.make || ''} onChange={set('make')} placeholder="e.g. Toyota" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input value={form.model || ''} onChange={set('model')} placeholder="e.g. Land Cruiser" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Year</label>
                <input type="number" min={1990} max={2030} value={form.year} onChange={set('year')} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Assign Driver <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                <select value={form.driver} onChange={set('driver')} style={inputStyle}>
                  <option value="">— No driver assigned —</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.email ? ` · ${d.email}` : ''}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Notes</label>
                <textarea rows={2} value={form.notes || ''} onChange={set('notes')} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', color: '#475569' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px', background: saving ? '#7cb99a' : '#207652', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {saving ? <><Spinner size={14} className="text-white" />Saving…</> : 'Save Changes'}
              </button>
            </div>
          </form>
          <VoiceEntryBar voiceEntry={voiceEntry} />
        </div>
      </div>
    </div>
  )
}

// ── Delete Vehicle Modal ──────────────────────────────────────────────────────
function DeleteVehicleModal({ open, onClose, vehicle, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setDeleting(true); setError('')
    try {
      await transportApi.vehicles.delete(vehicle.id)
      onDeleted(vehicle.id)
      onClose()
    } catch {
      setError('Failed to delete vehicle. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (!open || !vehicle) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px rgba(0,0,0,0.35)', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>Delete Vehicle?</h2>
        {error && <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '10px 14px', color: '#c02812', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</div>}
        <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: '#475569' }}>
          <strong>{vehicle.registration}</strong> will be permanently removed from the fleet. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', color: '#475569' }}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} style={{ flex: 2, padding: '11px', background: deleting ? '#f87171' : '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {deleting ? <><Spinner size={14} className="text-white" />Deleting…</> : <><Trash2 size={14} /> Delete Vehicle</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Transport Request Status Modal ────────────────────────────────────────────
// TransportRequest statuses: pending → assigned → completed / cancelled
const REQUEST_STATUS_TRANSITIONS = {
  pending:  [{ v: 'assigned',  l: 'Mark Assigned' },  { v: 'cancelled', l: 'Cancel' }],
  assigned: [{ v: 'completed', l: 'Mark Completed' }, { v: 'cancelled', l: 'Cancel' }],
}

function StatusModal({ open, onClose, request, onUpdated }) {
  const [newStatus, setNewStatus] = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const voiceFields = [{ key: 'notes', label: 'Notes', get: () => notes, set: setNotes }]
  const voiceEntry = useVoiceEntry(voiceFields)

  const options = REQUEST_STATUS_TRANSITIONS[request?.status] || []

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = { status: newStatus }
      if (notes) payload.notes = notes
      const { data } = await transportApi.requests.updateStatus(request.id, payload)
      onUpdated(data)
      onClose()
    } catch {
      setError('Failed to update status.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ position: 'relative', background: 'white', borderRadius: '16px', width: '100%', maxWidth: '420px', margin: '40px auto', boxShadow: '0 25px 50px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>Update Transport Request</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {error && <div style={{ background: '#fff4f2', border: '1px solid #ffd0c8', borderRadius: '8px', padding: '10px 14px', color: '#c02812', fontSize: '0.85rem', marginBottom: '16px' }}>{error}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Action <span style={{ color: '#e43418' }}>*</span></label>
              <select required value={newStatus} onChange={e => setNewStatus(e.target.value)} style={inputStyle}>
                <option value="">— Select —</option>
                {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              {options.length === 0 && <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>No transitions available for status: {request?.status}</p>}
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} className="mb-2" />
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any notes for this update..." />
            </div>
            <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', color: '#475569' }}>Cancel</button>
              <button type="submit" disabled={!newStatus || saving} style={{ flex: 2, padding: '11px', background: (!newStatus || saving) ? '#7cb99a' : '#207652', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: (!newStatus || saving) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {saving ? <><Spinner size={14} className="text-white" />Updating…</> : 'Update'}
              </button>
            </div>
          </form>
          <VoiceEntryBar voiceEntry={voiceEntry} />
        </div>
      </div>
    </div>
  )
}

// ── Tab Button ────────────────────────────────────────────────────────────────
function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: active ? 'white' : 'transparent', color: active ? '#0f172a' : '#64748b', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
      {children}
    </button>
  )
}

// ── Request Row ───────────────────────────────────────────────────────────────
// Uses actual TransportRequest fields: vehicle_registration, requested_by_name,
// notes, status, created_at, updated_at
function RequestRow({ r, onUpdate, showUpdate = true }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 text-xl">
        🚑
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">
          {r.vehicle_registration || 'No vehicle assigned'}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {r.requested_by_name || 'Unknown'} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
        </p>
        {r.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{r.notes}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={r.status} />
        {showUpdate && !['completed', 'cancelled'].includes(r.status) && (
          <button onClick={() => onUpdate(r)} className="btn-secondary text-xs px-2.5 py-1.5">Update</button>
        )}
      </div>
    </div>
  )
}

// ── Main Transport Page ───────────────────────────────────────────────────────
export function TransportPage() {
  const { isFacilityAdmin, isSuperAdmin } = useAuth()
  const [tab, setTab]           = useState('fleet')
  const [fleet, setFleet]       = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [vehicleModal, setVehicleModal] = useState(false)
  const [statusModal, setStatusModal]   = useState(null)

  const canManage = isFacilityAdmin || isSuperAdmin

  const [editTarget, setEditTarget]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)

  useEffect(() => {
    const fetchVehicles  = transportApi.vehicles.list()
      .then(({ data }) => setFleet(Array.isArray(data) ? data : data.results || []))
      .catch(() => {})
    const fetchRequests  = transportApi.requests.list()
      .then(({ data }) => setRequests(Array.isArray(data) ? data : data.results || []))
      .catch(() => {})
    Promise.all([fetchVehicles, fetchRequests]).finally(() => setLoading(false))
  }, [])

  const handleStatusUpdated = (updated) => {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    setStatusModal(null)
  }

  if (loading) return <PageSpinner />

  const active = requests.filter(r => !['completed', 'cancelled'].includes(r.status))
  const done   = requests.filter(r => r.status === 'completed')

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Transport</h1>
          <p className="text-slate-500 text-sm mt-1">
            {fleet.length} vehicle{fleet.length !== 1 ? 's' : ''} · {active.length} active request{active.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setVehicleModal(true)} className="btn-primary">
            <Plus size={16} /> Register Vehicle
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '12px', padding: '4px', width: 'fit-content' }}>
        <TabButton active={tab === 'fleet'}   onClick={() => setTab('fleet')}>Fleet ({fleet.length})</TabButton>
        <TabButton active={tab === 'active'}  onClick={() => setTab('active')}>Active ({active.length})</TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>History ({done.length})</TabButton>
      </div>

      {/* Fleet Tab */}
      {tab === 'fleet' && (
        fleet.length === 0 ? (
          <div className="card p-8 text-center">
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🚑</div>
            <p className="font-medium text-slate-700 mb-1">No vehicles registered</p>
            <p className="text-sm text-slate-400 mb-4">Register your first vehicle to start dispatching</p>
            {canManage && <button onClick={() => setVehicleModal(true)} className="btn-primary mx-auto"><Plus size={16} /> Register Vehicle</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
            {fleet.map(t => (
              <div key={t.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 flex items-center gap-2">
                      <span style={{ fontSize: '1.3rem' }}>{TYPE_ICONS[t.vehicle_type] || '🚗'}</span>
                      {t.registration}
                    </p>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">
                      {t.vehicle_type?.replace(/_/g, ' ')}
                      {t.make  ? ` · ${t.make}` : ''}
                      {t.model ? ` ${t.model}` : ''}
                      {t.year  ? ` (${t.year})` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={t.status} />
                    {canManage && (<>
                      <button onClick={() => setEditTarget(t)} title="Edit vehicle"
                        className="p-1.5 rounded-lg border border-green-200 text-green-600 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(t)} title="Delete vehicle"
                        className="p-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </>)}
                  </div>
                </div>
                {t.driver_name && (
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-slate-500">👤 {t.driver_name}</p>
                    {t.driver_phone && (
                      <a href={'tel:' + t.driver_phone}
                        className="text-xs text-brand-600 font-medium flex items-center gap-1 hover:underline"
                        onClick={e => e.stopPropagation()}>
                        <Phone size={10} /> {t.driver_phone}
                      </a>
                    )}
                  </div>
                )}
                {t.notes && <p className="text-xs text-slate-400 italic">{t.notes}</p>}
              </div>
            ))}
          </div>
        )
      )}

      {/* Active Requests Tab */}
      {tab === 'active' && (
        active.length === 0 ? (
          <div className="card p-8 text-center">
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✅</div>
            <p className="font-medium text-slate-700">No active transport requests</p>
            <p className="text-sm text-slate-400 mt-1">Requests are created from a referral or emergency case</p>
          </div>
        ) : (
          <div className="card divide-y divide-slate-50">
            {active.map(r => <RequestRow key={r.id} r={r} onUpdate={setStatusModal} />)}
          </div>
        )
      )}

      {/* History Tab */}
      {tab === 'history' && (
        done.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-slate-400">No completed transport requests yet</p>
          </div>
        ) : (
          <div className="card divide-y divide-slate-50">
            {done.map(r => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center shrink-0 text-xl">🚑</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">{r.vehicle_registration || 'No vehicle'}</p>
                  <p className="text-xs text-slate-400">
                    {r.updated_at ? format(new Date(r.updated_at), 'dd MMM, HH:mm') : '—'}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )
      )}

      <RegisterVehicleModal open={vehicleModal} onClose={() => setVehicleModal(false)} onCreated={v => setFleet(prev => [v, ...prev])} />
      {statusModal && <StatusModal open request={statusModal} onClose={() => setStatusModal(null)} onUpdated={handleStatusUpdated} />}

      <EditVehicleModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        vehicle={editTarget}
        onUpdated={updated => setFleet(prev => prev.map(v => v.id === updated.id ? updated : v))}
      />
      <DeleteVehicleModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        vehicle={deleteTarget}
        onDeleted={id => setFleet(prev => prev.filter(v => v.id !== id))}
      />
    </div>
  )
}

// ── Driver: My Dispatches Page ────────────────────────────────────────────────
export function MyDispatchesPage() {
  const [requests, setRequests]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [statusModal, setStatusModal] = useState(null)

  useEffect(() => {
    // mine=true filters to current driver's requests
    transportApi.requests.mine()
      .then(({ data }) => setRequests(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }, [])

  const handleStatusUpdated = (updated) => {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    setStatusModal(null)
  }

  if (loading) return <PageSpinner />

  const active    = requests.filter(r => !['completed', 'cancelled'].includes(r.status))
  const completed = requests.filter(r => r.status === 'completed')

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">My Dispatches</h1>
        <p className="text-slate-500 text-sm mt-1">{active.length} active</p>
      </div>

      {active.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active</p>
          <div className="card divide-y divide-slate-50">
            {active.map(r => (
              <div key={r.id} className="flex items-start gap-4 px-5 py-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 text-xl">🚑</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {r.vehicle_registration || 'Vehicle TBD'}
                  </p>
                  {r.referral && (
                    <p className="text-xs text-brand-600 font-medium mt-0.5">
                      📋 Referral: {String(r.referral).slice(0, 8)}…
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">
                    Requested {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    {r.requested_by_name ? ` by ${r.requested_by_name}` : ''}
                  </p>
                  {r.notes && <p className="text-xs text-slate-400 italic mt-0.5">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <button onClick={() => setStatusModal(r)} className="btn-secondary text-xs px-2.5 py-1.5">Update</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Completed</p>
          <div className="card divide-y divide-slate-50">
            {completed.map(r => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center shrink-0 text-xl">🚑</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">{r.vehicle_registration || 'Vehicle'}</p>
                  <p className="text-xs text-slate-400">{r.updated_at ? format(new Date(r.updated_at), 'dd MMM, HH:mm') : '—'}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {requests.length === 0 && (
        <div className="card p-8 text-center">
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🚑</div>
          <p className="font-medium text-slate-700">No dispatches assigned yet</p>
        </div>
      )}

      {statusModal && <StatusModal open request={statusModal} onClose={() => setStatusModal(null)} onUpdated={handleStatusUpdated} />}
    </div>
  )
}
