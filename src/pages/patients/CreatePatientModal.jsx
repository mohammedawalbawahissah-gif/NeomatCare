import { useState } from 'react'
import { Modal, Alert, FormField, Spinner } from '@/components/ui'
import { UserCircle } from 'lucide-react'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds } from '@/utils/offlineQueue'

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export default function CreatePatientModal({ open, onClose, onCreated, onQueued }) {
  const [form, setForm] = useState({
    patient_name: '', hospital_id: '', patient_phone_number: '',
    age: '', date_of_birth: '', town: '', blood_group: 'unknown',
    next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relationship: '',
    expected_delivery_date: '', gravida: '', parity: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const { submitOrQueue } = useOfflineQueue()

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.age) { setError('Age is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      // Convert empty strings to null for optional fields
      ;['date_of_birth','expected_delivery_date','gravida','parity'].forEach(k => {
        if (!payload[k]) payload[k] = null
      })
      if (payload.gravida)  payload.gravida = Number(payload.gravida)
      if (payload.parity)   payload.parity  = Number(payload.parity)
      payload.age = Number(payload.age)

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
            <input type="number" className={inputCls} value={form.age} onChange={set('age')} min={10} max={60}/>
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
    </Modal>
  )
}
