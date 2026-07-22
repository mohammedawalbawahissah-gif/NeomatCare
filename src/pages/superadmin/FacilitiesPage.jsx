import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { facilitiesApi } from '@/api/client'
import { PageSpinner, EmptyState, Modal, Spinner, FormField, StatCard } from '@/components/ui'
import { Building2, Plus, MapPin, CheckCircle, XCircle, Search, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'

// All 6 levels from the backend FacilityLevel model
const LEVEL_LABELS = {
  1: 'CHPS Compound',
  2: 'Health Centre',
  3: 'District Hospital',
  4: 'Regional Hospital',
  5: 'Teaching Hospital',
  6: 'Private Facility',
}
const LEVEL_COLORS = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-purple-100 text-purple-700',
  4: 'bg-amber-100 text-amber-700',
  5: 'bg-rose-100 text-rose-700',
  6: 'bg-teal-100 text-teal-700',
}

function CreateFacilityModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', level: 2, district: '', region: '', phone: '',
    latitude: '', longitude: '',
    available_services: [],
    icu_beds_available: 0, nicu_cots_available: 0,
    theatre_available: false, blood_bank: false, on_call_specialist: false, is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggle = k => setForm(f => ({ ...f, [k]: !f[k] }))
  const voiceFields = [
    { key: 'name', label: 'Facility Name', get: () => form.name, set: (v) => setForm(f => ({ ...f, name: v })) },
    { key: 'phone', label: 'Phone', get: () => form.phone, set: (v) => setForm(f => ({ ...f, phone: v })) },
    { key: 'district', label: 'District', get: () => form.district, set: (v) => setForm(f => ({ ...f, district: v })) },
    { key: 'region', label: 'Region', get: () => form.region, set: (v) => setForm(f => ({ ...f, region: v })) },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        level:               Number(form.level),
        latitude:            Number(form.latitude),
        longitude:           Number(form.longitude),
        icu_beds_available:  Number(form.icu_beds_available),
        nicu_cots_available: Number(form.nicu_cots_available),
      }
      const { data } = await facilitiesApi.create(payload)
      onCreated(data)
      onClose()
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to create facility.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Register New Facility" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Facility Name" required className="col-span-2">
            <input type="text" required value={form.name} onChange={set('name')} className="input-field" placeholder="e.g. Korle-Bu Teaching Hospital" />
          </FormField>
          <FormField label="Level" required>
            <select value={form.level} onChange={set('level')} className="input-field">
              {Object.entries(LEVEL_LABELS).map(([l, label]) => (
                <option key={l} value={l}>{l} – {label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Phone">
            <input type="text" value={form.phone} onChange={set('phone')} className="input-field" placeholder="+233 ..." />
          </FormField>
          <FormField label="District">
            <input type="text" value={form.district} onChange={set('district')} className="input-field" placeholder="e.g. Accra Metro" />
          </FormField>
          <FormField label="Region">
            <input type="text" value={form.region} onChange={set('region')} className="input-field" placeholder="e.g. Greater Accra" />
          </FormField>
          <FormField label="Latitude" required>
            <input type="number" step="any" required value={form.latitude} onChange={set('latitude')} className="input-field" placeholder="e.g. 5.5502" />
          </FormField>
          <FormField label="Longitude" required>
            <input type="number" step="any" required value={form.longitude} onChange={set('longitude')} className="input-field" placeholder="e.g. -0.2174" />
          </FormField>
          <FormField label="ICU Beds">
            <input type="number" min={0} value={form.icu_beds_available} onChange={set('icu_beds_available')} className="input-field" />
          </FormField>
          <FormField label="NICU Cots">
            <input type="number" min={0} value={form.nicu_cots_available} onChange={set('nicu_cots_available')} className="input-field" />
          </FormField>
        </div>
        <div className="bg-slate-50 rounded-xl px-4 py-2 space-y-0.5">
          {[['theatre_available','Theatre'],['blood_bank','Blood Bank'],['on_call_specialist','On-call Specialist']].map(([k, l]) => (
            <div key={k} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-700">{l}</span>
              <button type="button" onClick={() => toggle(k)} className={`relative w-10 h-5 rounded-full transition-colors ${form[k] ? 'bg-brand-500' : 'bg-slate-200'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[k] ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={16} className="text-white" /> : 'Register Facility'}
          </button>
        </div>
      </form>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}

function EditFacilityModal({ open, onClose, facility, onUpdated }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (facility) setForm({ ...facility })
  }, [facility])

  const formSafe = form || {}
  const voiceFields = [
    { key: 'name', label: 'Facility Name', get: () => formSafe.name, set: (v) => setForm(f => ({ ...f, name: v })) },
    { key: 'phone', label: 'Phone', get: () => formSafe.phone, set: (v) => setForm(f => ({ ...f, phone: v })) },
    { key: 'district', label: 'District', get: () => formSafe.district, set: (v) => setForm(f => ({ ...f, district: v })) },
    { key: 'region', label: 'Region', get: () => formSafe.region, set: (v) => setForm(f => ({ ...f, region: v })) },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  if (!form) return null

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggle = k => setForm(f => ({ ...f, [k]: !f[k] }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        level:               Number(form.level),
        latitude:            Number(form.latitude),
        longitude:           Number(form.longitude),
        icu_beds_available:  Number(form.icu_beds_available),
        nicu_cots_available: Number(form.nicu_cots_available),
      }
      const { data } = await facilitiesApi.update(facility.id, payload)
      onUpdated(data)
      onClose()
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to update facility.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Facility" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Facility Name" required className="col-span-2">
            <input type="text" required value={form.name} onChange={set('name')} className="input-field" />
          </FormField>
          <FormField label="Level" required>
            <select value={form.level} onChange={set('level')} className="input-field">
              {Object.entries(LEVEL_LABELS).map(([l, label]) => (
                <option key={l} value={l}>{l} – {label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Phone">
            <input type="text" value={form.phone || ''} onChange={set('phone')} className="input-field" placeholder="+233 ..." />
          </FormField>
          <FormField label="District">
            <input type="text" value={form.district || ''} onChange={set('district')} className="input-field" />
          </FormField>
          <FormField label="Region">
            <input type="text" value={form.region || ''} onChange={set('region')} className="input-field" />
          </FormField>
          <FormField label="Latitude" required>
            <input type="number" step="any" required value={form.latitude} onChange={set('latitude')} className="input-field" />
          </FormField>
          <FormField label="Longitude" required>
            <input type="number" step="any" required value={form.longitude} onChange={set('longitude')} className="input-field" />
          </FormField>
          <FormField label="ICU Beds">
            <input type="number" min={0} value={form.icu_beds_available} onChange={set('icu_beds_available')} className="input-field" />
          </FormField>
          <FormField label="NICU Cots">
            <input type="number" min={0} value={form.nicu_cots_available} onChange={set('nicu_cots_available')} className="input-field" />
          </FormField>
        </div>
        <div className="bg-slate-50 rounded-xl px-4 py-2 space-y-0.5">
          {[['theatre_available','Theatre'],['blood_bank','Blood Bank'],['on_call_specialist','On-call Specialist'],['is_active','Active']].map(([k, l]) => (
            <div key={k} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-700">{l}</span>
              <button type="button" onClick={() => toggle(k)} className={`relative w-10 h-5 rounded-full transition-colors ${form[k] ? 'bg-brand-500' : 'bg-slate-200'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[k] ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={16} className="text-white" /> : 'Save Changes'}
          </button>
        </div>
      </form>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}

function DeleteConfirmModal({ open, onClose, facility, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setDeleting(true); setError('')
    try {
      await facilitiesApi.delete(facility.id)
      onDeleted(facility.id)
      onClose()
    } catch {
      setError('Failed to delete facility. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete Facility" size="sm">
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-semibold text-slate-900">{facility?.name}</span>?
          This action cannot be undone.
        </p>
        <div className="flex gap-3 pt-1 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 justify-center flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60">
            {deleting ? <Spinner size={16} className="text-white" /> : <><Trash2 size={14} /> Delete Facility</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function FacilitiesPage() {
  const { isSuperAdmin } = useAuth()

  const [facilities, setFacilities]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [modal, setModal]             = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    facilitiesApi.list()
      .then(({ data }) => setFacilities(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = facilities.filter(f => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.district?.toLowerCase().includes(search.toLowerCase())
    const matchLevel  = !levelFilter || f.level === Number(levelFilter)
    return matchSearch && matchLevel
  })

  if (loading) return <PageSpinner />

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Facilities Registry</h1>
          <p className="text-slate-500 text-sm mt-1">{facilities.length} facilities registered</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16} /> Add Facility</button>
      </div>

      {/* Level breakdown — show all 6 levels */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Object.entries(LEVEL_LABELS).map(([l, label]) => (
          <button key={l} onClick={() => setLevelFilter(v => v === l ? '' : l)}
            className={clsx('card px-3 py-3 text-center transition-all', levelFilter === l ? 'ring-2 ring-brand-400' : 'hover:shadow-card-hover')}>
            <p className="text-xl font-semibold text-slate-900">{facilities.filter(f => f.level === Number(l)).length}</p>
            <span className={clsx('inline-block text-[10px] px-1.5 py-0.5 rounded font-medium mt-1', LEVEL_COLORS[l])}>L{l}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search by name or district..." />
        </div>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Levels</option>
          {Object.entries(LEVEL_LABELS).map(([l, label]) => <option key={l} value={l}>Level {l} — {label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No facilities found" description="Try adjusting your search or add a new facility" />
      ) : (
        <div className="card divide-y divide-slate-50">
          {filtered.map(f => (
            <div key={f.id} className="flex items-start gap-4 px-5 py-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <Building2 size={16} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{f.name}</p>
                  <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', LEVEL_COLORS[f.level])}>
                    L{f.level} · {LEVEL_LABELS[f.level]}
                  </span>
                  {!f.is_active && <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">Inactive</span>}
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <MapPin size={10} /> {[f.district, f.region].filter(Boolean).join(', ') || 'Location not set'}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {[
                    [f.theatre_available, 'Theatre'],
                    [f.blood_bank, 'Blood Bank'],
                    [f.on_call_specialist, 'Specialist'],
                  ].map(([available, label]) => (
                    <span key={label} className={clsx('flex items-center gap-1 text-xs', available ? 'text-brand-600' : 'text-slate-300')}>
                      {available ? <CheckCircle size={11} /> : <XCircle size={11} />} {label}
                    </span>
                  ))}
                  <span className="text-xs text-slate-400">· {f.icu_beds_available} ICU · {f.nicu_cots_available} NICU</span>
                </div>
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <button onClick={() => setEditTarget(f)} title="Edit facility"
                    className="p-1.5 rounded-lg border border-green-200 text-green-600 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(f)} title="Delete facility"
                    className="p-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateFacilityModal open={modal} onClose={() => setModal(false)} onCreated={f => setFacilities(prev => [f, ...prev])} />

      <EditFacilityModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        facility={editTarget}
        onUpdated={updated => setFacilities(prev => prev.map(f => f.id === updated.id ? updated : f))}
      />

      <DeleteConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        facility={deleteTarget}
        onDeleted={id => setFacilities(prev => prev.filter(f => f.id !== id))}
      />
    </div>
  )
}
