import { useState, useEffect } from 'react'
import { consultationsApi, facilitiesApi } from '@/api/client'
import { PageSpinner, EmptyState, Modal, Spinner, FormField } from '@/components/ui'
import { Stethoscope, Plus, Search, Pencil, Trash2, GraduationCap, Clock, Building2, Phone } from 'lucide-react'
import clsx from 'clsx'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'

// Web mirror of neomatcare-mobile/src/screens/superadmin/SpecialistsScreen.jsx.
// Same fields, same /api/consultations/specialists/ endpoints, same
// platform-wide-by-design note: a specialist is not tied to one facility to
// be manageable here. `facility` on a profile is only ever an optional
// "home base" tag for display — it has no bearing on which consultations a
// specialist can be matched to (see SpecialistSearchView on the backend).
const SPECIALTIES = [
  { value: 'obstetrics', label: 'Obstetrics' },
  { value: 'gynecology', label: 'Gynaecology' },
  { value: 'neonatology', label: 'Neonatology' },
  { value: 'midwifery', label: 'Midwifery' },
  { value: 'anaesthesiology', label: 'Anaesthesiology' },
  { value: 'internal_medicine', label: 'Internal Medicine' },
  { value: 'emergency_medicine', label: 'Emergency Medicine' },
  { value: 'other', label: 'Other' },
]
const SPECIALTY_LABEL = Object.fromEntries(SPECIALTIES.map((s) => [s.value, s.label]))

const INITIAL = {
  name: '', professional_pin: '', specialty: 'obstetrics', qualification: '',
  years_experience: '0', specialist_phone: '', specialist_email: '',
  whatsapp_number: '', emergency_contact: '', bio: '', is_available: true, facility: '',
}

function SpecialistFormModal({ open, onClose, specialist, facilities, onSaved }) {
  const isEdit = !!specialist
  const [form, setForm]     = useState(INITIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    setForm(specialist ? {
      professional_pin: specialist.professional_pin || '', specialty: specialist.specialty || 'obstetrics',
      qualification: specialist.qualification || '', specialist_phone: specialist.specialist_phone || '',
      specialist_email: specialist.specialist_email || '', whatsapp_number: specialist.whatsapp_number || '',
      emergency_contact: specialist.emergency_contact || '', bio: specialist.bio || '',
      is_available: !!specialist.is_available,
      name: specialist.user_name || '',
      years_experience: String(specialist.years_experience ?? 0),
      facility: specialist.facility || '',
    } : INITIAL)
    setError('')
  }, [open, specialist])

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggle = k => setForm(f => ({ ...f, [k]: !f[k] }))
  const voiceFields = [
    { key: 'name', label: 'Specialist Name', get: () => form.name, set: (v) => setForm(f => ({ ...f, name: v })) },
    { key: 'professional_pin', label: 'Professional Pin', get: () => form.professional_pin, set: (v) => setForm(f => ({ ...f, professional_pin: v })) },
    { key: 'qualification', label: 'Qualification', get: () => form.qualification, set: (v) => setForm(f => ({ ...f, qualification: v })) },
    { key: 'specialist_phone', label: 'Phone', get: () => form.specialist_phone, set: (v) => setForm(f => ({ ...f, specialist_phone: v })) },
    { key: 'whatsapp_number', label: 'WhatsApp', get: () => form.whatsapp_number, set: (v) => setForm(f => ({ ...f, whatsapp_number: v })) },
    { key: 'emergency_contact', label: 'Emergency Contact', get: () => form.emergency_contact, set: (v) => setForm(f => ({ ...f, emergency_contact: v })) },
    { key: 'bio', label: 'Bio', get: () => form.bio, set: (v) => setForm(f => ({ ...f, bio: v })) },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isEdit && !form.name.trim()) { setError('Specialist name is required.'); return }
    if (!form.professional_pin.trim()) { setError('Professional pin is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...(isEdit ? {} : { name: form.name }),
        professional_pin: form.professional_pin, specialty: form.specialty,
        qualification: form.qualification, years_experience: Number(form.years_experience) || 0,
        specialist_phone: form.specialist_phone, specialist_email: form.specialist_email,
        whatsapp_number: form.whatsapp_number, emergency_contact: form.emergency_contact,
        bio: form.bio, is_available: form.is_available, facility: form.facility || null,
      }
      const { data } = isEdit
        ? await consultationsApi.specialists.update(specialist.id, payload)
        : await consultationsApi.specialists.create(payload)
      onSaved(data)
      onClose()
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to save specialist profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Specialist' : 'Add Specialist Profile'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />
        <div className="grid grid-cols-2 gap-3">
          {!isEdit && (
            <FormField label="Specialist Name" required className="col-span-2">
              <input type="text" required value={form.name} onChange={set('name')} className="input-field" placeholder="e.g. Dr. Ama Owusu" />
            </FormField>
          )}
          <FormField label="Professional Pin" required>
            <input type="text" required value={form.professional_pin} onChange={set('professional_pin')} className="input-field" placeholder="e.g. MDC/PN/XXXXX" />
          </FormField>
          <FormField label="Specialty" required>
            <select value={form.specialty} onChange={set('specialty')} className="input-field">
              {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FormField>
          <FormField label="Years Experience">
            <input type="number" min={0} value={form.years_experience} onChange={set('years_experience')} className="input-field" />
          </FormField>
          <FormField label="Qualification">
            <input type="text" value={form.qualification} onChange={set('qualification')} className="input-field" placeholder="e.g. MBChB, FWACS" />
          </FormField>
          <FormField label="Phone">
            <input type="text" value={form.specialist_phone} onChange={set('specialist_phone')} className="input-field" placeholder="e.g. 0241234567" />
          </FormField>
          <FormField label="Email">
            <input type="email" value={form.specialist_email} onChange={set('specialist_email')} className="input-field" placeholder="doctor@email.com" />
          </FormField>
          <FormField label="WhatsApp">
            <input type="text" value={form.whatsapp_number} onChange={set('whatsapp_number')} className="input-field" placeholder="e.g. 0241234567" />
          </FormField>
          <FormField label="Emergency Contact">
            <input type="text" value={form.emergency_contact} onChange={set('emergency_contact')} className="input-field" placeholder="Alternative contact" />
          </FormField>
          <FormField label="Facility (optional — for display only)" className="col-span-2" hint="Does not restrict which consultations this specialist can be matched to.">
            <select value={form.facility} onChange={set('facility')} className="input-field">
              <option value="">— No facility tag —</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </FormField>
          <FormField label="Bio" className="col-span-2">
            <textarea value={form.bio} onChange={set('bio')} rows={2} className="input-field" placeholder="Brief professional bio…" />
          </FormField>
        </div>
        <div className="bg-slate-50 rounded-xl px-4 py-1">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-slate-700">Available for consultations</span>
            <button type="button" onClick={() => toggle('is_available')} className={`relative w-10 h-5 rounded-full transition-colors ${form.is_available ? 'bg-brand-500' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_available ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={16} className="text-white" /> : (isEdit ? 'Save Changes' : 'Create Profile')}
          </button>
        </div>
      </form>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}

function DeleteSpecialistModal({ open, onClose, specialist, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setDeleting(true); setError('')
    try {
      await consultationsApi.specialists.delete(specialist.id)
      onDeleted(specialist.id)
      onClose()
    } catch {
      setError('Failed to delete specialist profile. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (!specialist) return null
  return (
    <Modal open={open} onClose={onClose} title="Delete Specialist Profile?" size="sm">
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-semibold text-slate-900">{specialist.user_name}</span>'s
          specialist profile? This can't be undone, and any past consultations will keep showing this name but lose the live profile link.
        </p>
        <div className="flex gap-3 pt-1 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 justify-center flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60">
            {deleting ? <Spinner size={16} className="text-white" /> : <><Trash2 size={14} /> Delete Profile</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function SpecialistsPage() {
  const [specialists, setSpecialists] = useState([])
  const [facilities, setFacilities]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [search, setSearch]           = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')
  const [availOnly, setAvailOnly]     = useState(false)
  const [modal, setModal]             = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    Promise.all([consultationsApi.specialists.list(), facilitiesApi.list()])
      .then(([{ data: s }, { data: f }]) => {
        setSpecialists(Array.isArray(s) ? s : (s.results || []))
        setFacilities(Array.isArray(f) ? f : (f.results || []))
      })
      .catch(() => setError('Could not load specialists. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const toggleAvailable = async (s) => {
    // Optimistic — a one-tap status flip an admin does often; a failed
    // request self-corrects visibly (banner + revert) rather than making
    // every toggle wait on a round trip.
    const next = !s.is_available
    setSpecialists((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_available: next } : x)))
    try {
      await consultationsApi.specialists.update(s.id, { is_available: next })
    } catch {
      setSpecialists((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_available: s.is_available } : x)))
      setError('Could not update availability. Please try again.')
    }
  }

  const filtered = specialists.filter((s) => {
    const name = (s.user_name || '').toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) || s.professional_pin?.toLowerCase().includes(search.toLowerCase())
    const matchSpecialty = !specialtyFilter || s.specialty === specialtyFilter
    const matchAvail = !availOnly || s.is_available
    return matchSearch && matchSpecialty && matchAvail
  })

  if (loading) return <PageSpinner />

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Specialists</h1>
          <p className="text-slate-500 text-sm mt-1">{specialists.length} registered · {specialists.filter((s) => s.is_available).length} available</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16} /> Add Specialist</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search by name or pin..." />
        </div>
        <button onClick={() => setAvailOnly(v => !v)} className={clsx('px-3 py-2 rounded-lg text-sm font-medium border transition-colors', availOnly ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>
          Available now
        </button>
        <select value={specialtyFilter} onChange={e => setSpecialtyFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Specialties</option>
          {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Stethoscope} title="No specialists found" description="Try adjusting your search or filters, or add a new specialist profile"
          action={<button onClick={() => setModal(true)} className="btn-primary">Add Specialist</button>} />
      ) : (
        <div className="card divide-y divide-slate-50">
          {filtered.map(s => (
            <div key={s.id} className="flex items-start gap-4 px-5 py-4">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <Stethoscope size={16} className="text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{s.user_name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                    {s.specialty_display || SPECIALTY_LABEL[s.specialty]}
                  </span>
                  <span className="text-xs text-slate-400">· {s.professional_pin}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap mt-2">
                  {!!s.qualification && <span className="flex items-center gap-1 text-xs text-slate-500"><GraduationCap size={11} /> {s.qualification}</span>}
                  {s.years_experience > 0 && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={11} /> {s.years_experience} years experience</span>}
                  {!!s.facility && <span className="flex items-center gap-1 text-xs text-slate-500"><Building2 size={11} /> {facilities.find((f) => f.id === s.facility)?.name || 'Facility assigned'}</span>}
                  {(!!s.specialist_phone || !!s.whatsapp_number) && (
                    <span className="flex items-center gap-1 text-xs text-slate-500"><Phone size={11} /> {s.specialist_phone || s.whatsapp_number}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <button
                  onClick={() => toggleAvailable(s)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${s.is_available ? 'bg-brand-500' : 'bg-slate-200'}`}
                  title={s.is_available ? 'Available' : 'Unavailable'}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${s.is_available ? 'translate-x-4' : ''}`} />
                </button>
                <button onClick={() => setEditTarget(s)} title="Edit specialist"
                  className="p-1.5 rounded-lg border border-green-200 text-green-600 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteTarget(s)} title="Delete specialist"
                  className="p-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SpecialistFormModal
        open={modal || !!editTarget}
        onClose={() => { setModal(false); setEditTarget(null) }}
        specialist={editTarget}
        facilities={facilities}
        onSaved={(saved) => {
          setSpecialists((prev) => editTarget
            ? prev.map((x) => (x.id === saved.id ? saved : x))
            : [saved, ...prev])
        }}
      />

      <DeleteSpecialistModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        specialist={deleteTarget}
        onDeleted={(id) => setSpecialists((prev) => prev.filter((x) => x.id !== id))}
      />
    </div>
  )
}
