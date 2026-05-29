import { useState, useEffect } from 'react'
import { facilitiesApi } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { PageSpinner, Alert, Spinner, FormField, StatCard } from '@/components/ui'
import { Building2, CheckCircle, XCircle, History, Save } from 'lucide-react'
import { format } from 'date-fns'

function CapacityToggle({ label, value, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-700">{label}</span>
      <button type="button" onClick={() => onChange(!value)} disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-brand-500' : 'bg-slate-200'} disabled:opacity-50`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

// All 6 levels from backend FacilityLevel model
const LEVEL_LABELS = {
  1: 'CHPS Compound',
  2: 'Health Centre',
  3: 'District Hospital',
  4: 'Regional Hospital',
  5: 'Teaching Hospital',
  6: 'Private Facility',
}

export default function FacilityPage() {
  const { user } = useAuth()
  const facilityId = user?.facility_id

  const [facility, setFacility]       = useState(null)
  const [history, setHistory]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [success, setSuccess]         = useState('')
  const [error, setError]             = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const [capacity, setCapacity] = useState({
    icu_beds_available:  0,
    nicu_cots_available: 0,
    theatre_available:   false,
    blood_bank:          false,
    on_call_specialist:  false,
  })

  useEffect(() => {
    if (!facilityId) { setLoading(false); return }
    Promise.all([
      facilitiesApi.detail(facilityId),
      facilitiesApi.capacityHistory(facilityId),
    ]).then(([{ data: f }, { data: h }]) => {
      setFacility(f)
      setHistory(Array.isArray(h) ? h : h.results || [])
      setCapacity({
        icu_beds_available:  f.icu_beds_available,
        nicu_cots_available: f.nicu_cots_available,
        theatre_available:   f.theatre_available,
        blood_bank:          f.blood_bank,
        on_call_specialist:  f.on_call_specialist,
      })
    }).finally(() => setLoading(false))
  }, [facilityId])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    try {
      const { data } = await facilitiesApi.updateCapacity(facilityId, capacity)
      setFacility(data.facility)
      setSuccess('Capacity updated successfully.')
      const { data: h } = await facilitiesApi.capacityHistory(facilityId)
      setHistory(Array.isArray(h) ? h : h.results || [])
    } catch {
      setError('Failed to update capacity.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSpinner />
  if (!facilityId) return <div className="p-6"><Alert type="error" message="Your account is not linked to a facility." /></div>
  if (!facility)   return <div className="p-6"><Alert type="error" message="Facility not found." /></div>

  const f = facility

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">{f.name}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {LEVEL_LABELS[f.level] || `Level ${f.level}`} · {f.district}{f.region ? `, ${f.region}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="ICU Beds"   value={f.icu_beds_available}  icon={Building2} color="blue" />
        <StatCard label="NICU Cots"  value={f.nicu_cots_available} icon={Building2} color="purple" />
        <StatCard label="Theatre"    value={f.theatre_available ? 'Available' : 'Unavailable'} icon={f.theatre_available ? CheckCircle : XCircle} color={f.theatre_available ? 'brand' : 'slate'} />
        <StatCard label="Blood Bank" value={f.blood_bank ? 'Available' : 'Unavailable'} icon={f.blood_bank ? CheckCircle : XCircle} color={f.blood_bank ? 'brand' : 'slate'} />
      </div>

      <div className="card px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-slate-900">Real-time Capacity</h2>
          <span className="text-xs text-slate-400">Updates visible to the referral engine immediately</span>
        </div>

        <Alert type="success" message={success} className="mb-4" />
        <Alert type="error"   message={error}   className="mb-4" />

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="ICU Beds Available">
              <input type="number" min={0} value={capacity.icu_beds_available}
                onChange={e => setCapacity(c => ({ ...c, icu_beds_available: Number(e.target.value) }))}
                className="input-field" />
            </FormField>
            <FormField label="NICU Cots Available">
              <input type="number" min={0} value={capacity.nicu_cots_available}
                onChange={e => setCapacity(c => ({ ...c, nicu_cots_available: Number(e.target.value) }))}
                className="input-field" />
            </FormField>
          </div>

          <div className="bg-slate-50 rounded-xl px-4 py-2">
            <CapacityToggle label="Theatre Available"   value={capacity.theatre_available}  onChange={v => setCapacity(c => ({ ...c, theatre_available: v }))}  disabled={saving} />
            <CapacityToggle label="Blood Bank"          value={capacity.blood_bank}         onChange={v => setCapacity(c => ({ ...c, blood_bank: v }))}         disabled={saving} />
            <CapacityToggle label="On-call Specialist"  value={capacity.on_call_specialist} onChange={v => setCapacity(c => ({ ...c, on_call_specialist: v }))} disabled={saving} />
          </div>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Spinner size={16} className="text-white" /> : <><Save size={15} /> Save Capacity</>}
          </button>
        </form>
      </div>

      {f.available_services?.length > 0 && (
        <div className="card px-6 py-5">
          <h2 className="font-medium text-slate-800 mb-3">Available Services</h2>
          <div className="flex flex-wrap gap-2">
            {f.available_services.map(s => (
              <span key={s} className="px-2.5 py-1 bg-brand-50 text-brand-700 text-xs font-medium rounded-lg">{s.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <button onClick={() => setShowHistory(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2">
            <History size={16} className="text-slate-400" />
            <span className="font-medium text-slate-800">Capacity History</span>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{history.length}</span>
          </div>
          <span className="text-xs text-slate-400">{showHistory ? 'Hide' : 'Show'}</span>
        </button>

        {showHistory && (
          <div className="border-t border-slate-100 divide-y divide-slate-50">
            {history.slice(0, 20).map(h => (
              <div key={h.id} className="px-6 py-3 flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-700">{h.changed_by_name || 'System'}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(h.snapshot).map(([k, v]) => (
                      <span key={k} className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded">
                        {k.replace(/_/g, ' ')}: <strong>{String(v)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap ml-4 shrink-0">
                  {format(new Date(h.timestamp), 'dd MMM, HH:mm')}
                </p>
              </div>
            ))}
            {history.length === 0 && <p className="px-6 py-5 text-sm text-center text-slate-400">No changes recorded yet</p>}
          </div>
        )}
      </div>
    </div>
  )
}
