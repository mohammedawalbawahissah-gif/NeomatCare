import { useState } from 'react'
import { Modal, Alert } from '@/components/ui'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds } from '@/utils/offlineQueue'

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export default function LogGrowthRecordModal({ open, onClose, patientId, onSaved, onQueued }) {
  const [form, setForm] = useState({
    record_date: new Date().toISOString().slice(0, 10),
    weight_kg: '', muac_cm: '', height_cm: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const { submitOrQueue } = useOfflineQueue()

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.record_date) { setError('Date is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = { record_date: form.record_date, notes: form.notes }
      if (form.weight_kg) payload.weight_kg = Number(form.weight_kg)
      if (form.muac_cm)   payload.muac_cm   = Number(form.muac_cm)
      if (form.height_cm) payload.height_cm = Number(form.height_cm)

      const result = await submitOrQueue({
        method: 'post',
        url: `/api/cases/patients/${patientId}/growth-records/`,
        data: payload,
        meta: { kind: QueueKinds.GROWTH_RECORD_CREATE, label: `Growth record — ${form.record_date}` },
      })

      if (result.queued) {
        onQueued?.()
      } else {
        onSaved(result.response.data)
      }
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to save growth record.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log Growth Record" size="sm">
      <div className="space-y-4">
        {error && <Alert type="error" message={error}/>}
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" className={inputCls} value={form.record_date} onChange={set('record_date')}/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Weight (kg)</label>
            <input type="number" step="0.1" className={inputCls} value={form.weight_kg} onChange={set('weight_kg')} placeholder="e.g. 8.2"/>
          </div>
          <div>
            <label className={labelCls}>MUAC (cm)</label>
            <input type="number" step="0.1" className={inputCls} value={form.muac_cm} onChange={set('muac_cm')} placeholder="e.g. 13.5"/>
          </div>
        </div>
        <div>
          <label className={labelCls}>Height (cm)</label>
          <input type="number" step="0.1" className={inputCls} value={form.height_cm} onChange={set('height_cm')} placeholder="Optional"/>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea className={inputCls} rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional"/>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Entry'}</button>
        </div>
      </div>
    </Modal>
  )
}
