import { useState, useEffect, useCallback } from 'react'
import { consultationsApi } from '@/api/client'
import { PageSpinner, EmptyState, FormField, Spinner } from '@/components/ui'
import { Stethoscope, CheckCircle2 } from 'lucide-react'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'

// Web mirror of neomatcare-mobile/src/screens/specialist/SpecialistProfileScreen.jsx.
// Same fields, same self-service /api/consultations/specialists/me/ endpoint.
//
// This page only exists for a user with role='specialist'. The
// SpecialistProfile record it edits, however, is a separate model an admin
// creates/links (see consultations.SpecialistProfileViewSet.me) — so a
// brand-new specialist account can legitimately have no linked profile yet.
// We surface that as an explicit empty state rather than a blank form.
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

export default function SpecialistProfilePage() {
  const [profile, setProfile]   = useState(null)
  const [notLinked, setNotLinked] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [form, setForm]         = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError(''); setNotLinked(false)
    consultationsApi.specialists.me()
      .then(({ data }) => {
        setProfile(data)
        setForm({
          specialty: data.specialty, qualification: data.qualification || '',
          years_experience: String(data.years_experience ?? 0),
          specialist_phone: data.specialist_phone || '', specialist_email: data.specialist_email || '',
          whatsapp_number: data.whatsapp_number || '', emergency_contact: data.emergency_contact || '',
          bio: data.bio || '', is_available: !!data.is_available,
        })
      })
      .catch((err) => {
        if (err?.response?.status === 404) setNotLinked(true)
        else setError('Could not load your specialist profile. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }

  const voiceFields = form ? [
    { key: 'qualification', label: 'Qualification', get: () => form.qualification, set: (v) => set('qualification')(v) },
    { key: 'specialist_phone', label: 'Phone', get: () => form.specialist_phone, set: (v) => set('specialist_phone')(v) },
    { key: 'whatsapp_number', label: 'WhatsApp', get: () => form.whatsapp_number, set: (v) => set('whatsapp_number')(v) },
    { key: 'emergency_contact', label: 'Emergency Contact', get: () => form.emergency_contact, set: (v) => set('emergency_contact')(v) },
    { key: 'bio', label: 'Bio', get: () => form.bio, set: (v) => set('bio')(v) },
  ] : []
  const voiceEntry = useVoiceEntry(voiceFields)

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      const { data } = await consultationsApi.specialists.updateMe({
        specialty: form.specialty, qualification: form.qualification,
        years_experience: Number(form.years_experience) || 0,
        specialist_phone: form.specialist_phone, specialist_email: form.specialist_email,
        whatsapp_number: form.whatsapp_number, emergency_contact: form.emergency_contact,
        bio: form.bio, is_available: form.is_available,
      })
      setProfile(data)
      setSaved(true)
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSpinner />

  if (notLinked) {
    return (
      <div className="p-6 space-y-5 animate-fade-in">
        <div>
          <h1 className="section-title">My Specialist Profile</h1>
        </div>
        <EmptyState
          icon={Stethoscope}
          title="No profile linked yet"
          description="Your account isn't linked to a specialist profile. Ask your facility admin or a superadmin to link one to your name."
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">{profile?.user_name || 'My Specialist Profile'}</h1>
          <p className="text-slate-500 text-sm mt-1">{profile?.professional_pin}</p>
        </div>
        <span className={`status-badge ${form.is_available ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
          {form.is_available ? 'Available' : 'Unavailable'}
        </span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{error}</div>}
      {saved && (
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2.5 text-sm text-brand-700">
          <CheckCircle2 size={16} /> Profile updated
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="card px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Available for consultations</p>
            <p className="text-xs text-slate-400 mt-0.5">Turn this off when you can't take calls — you'll drop out of the specialist list until you turn it back on.</p>
          </div>
          <button
            type="button"
            onClick={() => set('is_available')(!form.is_available)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${form.is_available ? 'bg-brand-500' : 'bg-slate-200'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_available ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />

        <div className="card px-5 py-5 space-y-4">
          <FormField label="Specialty" required>
            <select value={form.specialty} onChange={set('specialty')} className="input-field">
              {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Qualification">
              <input type="text" value={form.qualification} onChange={set('qualification')} className="input-field" placeholder="e.g. MBChB, FWACS" />
            </FormField>
            <FormField label="Years Experience">
              <input type="number" min={0} value={form.years_experience} onChange={set('years_experience')} className="input-field" />
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
          </div>
          <FormField label="Bio">
            <textarea value={form.bio} onChange={set('bio')} rows={3} className="input-field" placeholder="Brief professional bio…" />
          </FormField>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <Spinner size={16} className="text-white" /> : 'Save Changes'}
        </button>
      </form>

      <VoiceEntryBar voiceEntry={voiceEntry} />
    </div>
  )
}
