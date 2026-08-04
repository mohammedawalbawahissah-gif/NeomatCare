import { useState } from 'react'
import { Modal, Alert } from '@/components/ui'
import { useOfflineQueue } from '@/contexts/OfflineQueueContext'
import { QueueKinds } from '@/utils/offlineQueue'

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

const FOOD_SECURITY_OPTIONS = [
  { value: 'unknown',  label: 'Unknown' },
  { value: 'secure',   label: 'Secure' },
  { value: 'at_risk',  label: 'At risk' },
  { value: 'insecure', label: 'Insecure' },
]

export default function CreateHouseholdModal({ open, onClose, onCreated, onQueued }) {
  const [form, setForm] = useState({
    head_name: '', town: '', food_security_flag: 'unknown',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const { submitOrQueue } = useOfflineQueue()

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const result = await submitOrQueue({
        method: 'post',
        url: '/api/cases/households/',
        data: form,
        meta: { kind: QueueKinds.HOUSEHOLD_CREATE, label: form.head_name || 'New household' },
      })
      if (result.queued) {
        onQueued?.()
      } else {
        onCreated(result.response.data)
      }
      setForm({ head_name: '', town: '', food_security_flag: 'unknown' })
    } catch (err) {
      const d = err?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to create household.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Household" size="sm">
      <div className="space-y-4">
        {error && <Alert type="error" message={error}/>}

        <div>
          <label className={labelCls}>Head of household</label>
          <input className={inputCls} value={form.head_name} onChange={set('head_name')} placeholder="e.g. Amina's Compound"/>
        </div>
        <div>
          <label className={labelCls}>Town / Community</label>
          <input className={inputCls} value={form.town} onChange={set('town')} placeholder="e.g. Tamale"/>
        </div>
        <div>
          <label className={labelCls}>Food security status</label>
          <select className={inputCls} value={form.food_security_flag} onChange={set('food_security_flag')}>
            {FOOD_SECURITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">Used to scope nutrition guidance for this household's children.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving || !form.head_name}>
            {saving ? 'Saving…' : 'Create Household'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
