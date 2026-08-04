import { useState, useEffect } from 'react'
import { Modal, Alert, FormField, Spinner } from '@/components/ui'
import { UserCircle, Baby } from 'lucide-react'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds } from '@/utils/offlineQueue'
import { householdsApi } from '@/api/client'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export default function CreatePatientModal({ open, onClose, onCreated, onQueued }) {
  const [form, setForm] = useState({
    patient_type: 'maternal', household: '',
    patient_name: '', hospital_id: '', patient_phone_number: '',
    age: '', date_of_birth: '', town: '', blood_group: 'unknown',
    next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relationship: '',
    expected_delivery_date: '', gravida: '', parity: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [households, setHouseholds] = useState([])
  const { submitOrQueue } = useOfflineQueue()

  // Household picker is always available regardless of patient type — a
  // maternal patient can belong to a tracked household too, not just children.
  useEffect(() => {
    if (!open) return
    householdsApi.list().then(({ data }) => {
      setHouseholds(Array.isArray(data) ? data : data.results || [])
    }).catch(() => { /* picker just stays empty — not a blocking failure */ })
  }, [open])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setVoiceField = k => (v) => setForm(f => ({ ...f, [k]: v }))
  const voiceFields = [
    { key: 'patient_name', label: 'Full Name', get: () => form.patient_name, set: setVoiceField('patient_name') },
    { key: 'hospital_id', label: 'Hospital / Folder ID', get: () => form.hospital_id, set: setVoiceField('hospital_id') },
    { key: 'patient_phone_number', label: 'Phone Number', get: () => form.patient_phone_number, set: setVoiceField('patient_phone_number') },
    { key: 'town', label: 'Town / Community', get: () => form.town, set: setVoiceField('town') },
    { key: 'next_of_kin_name', label: 'Next of Kin Name', get: () => form.next_of_kin_name, set: setVoiceField('next_of_kin_name') },
    { key: 'next_of_kin_phone', label: 'Next of Kin Phone', get: () => form.next_of_kin_phone, set: setVoiceField('next_of_kin_phone') },
    { key: 'next_of_kin_relationship', label: 'Next of Kin Relationship', get: () => form.next_of_kin_relationship, set: setVoiceField('next_of_kin_relationship') },
    { key: 'notes', label: 'Notes', get: () => form.notes, set: setVoiceField('notes') },
  ]
  const voiceEntry = useVoiceEntry(voiceFields)

  const handleSave = async () => {
    if (!form.age) { setError('Age is required.'); return }
    if (form.patient_type === 'child' && Number(form.age) > 5) {
      setError('Child records are for children under 5 years old. Use Maternal for older patients.')
      return
    }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      // Convert empty strings to null for optional fields
      ;['date_of_birth','expected_delivery_date','gravida','parity','household'].forEach(k => {
        if (!payload[k]) payload[k] = null
      })
      if (payload.gravida)  payload.gravida = Number(payload.gravida)
      if (payload.parity)   payload.parity  = Number(payload.parity)
      payload.age = Number(payload.age)
      // Obstetric fields don't apply to a child record — don't send stale
      // values even if they were populated before switching the toggle.
      if (payload.patient_type === 'child') {
        payload.gravida = null
        payload.parity = null
        payload.expected_delivery_date = null
      }

      const result = await submitOrQueue({
        method: 'post',
        url: '/api/cases/patients/',
        data: payload,
        meta: { kind: QueueKinds.PATIENT_CREATE, label: payload.patient_name || 'New patient' },
      })

      if (result.queued) {
        // No server id yet — there's no detail page to route to, so just
        // close the modal. The sync queue indicator + the pending row in
        // the list are what tell the person it's saved.
        onQueued?.()
      } else {
        onCreated(result.response.data)
      }
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to create patient.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Patient Record" size="lg">
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
        {error && <Alert type="error" message={error}/>}
        <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} />

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Patient Type</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, patient_type: 'maternal' }))}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                form.patient_type === 'maternal'
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <UserCircle size={15}/> Maternal
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, patient_type: 'child' }))}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                form.patient_type === 'child'
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <Baby size={15}/> Child
            </button>
          </div>
          <div>
            <label className={labelCls}>Household</label>
            <select className={inputCls} value={form.household} onChange={set('household')}>
              <option value="">Not linked to a household</option>
              {households.map(h => (
                <option key={h.id} value={h.id}>{h.head_name || 'Unnamed'} — {h.town || 'No town'}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Identity</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Full Name</label>
            <input className={inputCls} value={form.patient_name} onChange={set('patient_name')} placeholder="Patient's full name"/>
          </div>
          <div>
            <label className={labelCls}>Hospital / Folder ID</label>
            <input className={inputCls} value={form.hospital_id} onChange={set('hospital_id')} placeholder="e.g. KBU-2024-001"/>
          </div>
          <div>
            <label className={labelCls}>Phone Number</label>
            <input className={inputCls} value={form.patient_phone_number} onChange={set('patient_phone_number')} placeholder="e.g. 024 000 0000"/>
          </div>
          <div>
            <label className={labelCls}>Age <span className="text-red-500">*</span></label>
            <input
              type="number" className={inputCls} value={form.age} onChange={set('age')}
              min={0} max={form.patient_type === 'child' ? 5 : 120}
            />
            {form.patient_type === 'child' && (
              <p className="text-xs text-slate-400 mt-1">Nutrition guidance is available for children under 5.</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Date of Birth</label>
            <input type="date" className={inputCls} value={form.date_of_birth} onChange={set('date_of_birth')}/>
          </div>
          <div>
            <label className={labelCls}>Town / Community</label>
            <input className={inputCls} value={form.town} onChange={set('town')} placeholder="e.g. Kumasi"/>
          </div>
          <div>
            <label className={labelCls}>Blood Group</label>
            <select className={inputCls} value={form.blood_group} onChange={set('blood_group')}>
              {['unknown','A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => (
                <option key={g} value={g}>{g === 'unknown' ? 'Unknown' : g}</option>
              ))}
            </select>
          </div>
        </div>

        {form.patient_type === 'maternal' && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-2">Obstetric Summary</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Gravida</label>
                <input type="number" className={inputCls} value={form.gravida} onChange={set('gravida')} min={0} placeholder="—"/>
              </div>
              <div>
                <label className={labelCls}>Parity</label>
                <input type="number" className={inputCls} value={form.parity} onChange={set('parity')} min={0} placeholder="—"/>
              </div>
              <div>
                <label className={labelCls}>Expected Delivery</label>
                <input type="date" className={inputCls} value={form.expected_delivery_date} onChange={set('expected_delivery_date')}/>
              </div>
            </div>
          </>
        )}

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-2">Next of Kin</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={form.next_of_kin_name} onChange={set('next_of_kin_name')} placeholder="Full name"/>
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.next_of_kin_phone} onChange={set('next_of_kin_phone')} placeholder="Contact number"/>
          </div>
          <div>
            <label className={labelCls}>Relationship</label>
            <input className={inputCls} value={form.next_of_kin_relationship} onChange={set('next_of_kin_relationship')} placeholder="e.g. Husband"/>
          </div>
        </div>

        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-2">Notes</p>
        <textarea rows={2} className={inputCls + ' resize-none'} value={form.notes} onChange={set('notes')} placeholder="Background clinical notes, chronic conditions…"/>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
        <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
          {saving ? <><Spinner size={14} className="text-white"/> Saving…</> : <><UserCircle size={14}/> Create Patient</>}
        </button>
      </div>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}
