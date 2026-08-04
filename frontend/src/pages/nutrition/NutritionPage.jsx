import { useState, useEffect } from 'react'
import { patientsApi } from '@/api/client'
import { PageSpinner, Alert, EmptyState } from '@/components/ui'
import { Baby, Search } from 'lucide-react'
import LogGrowthRecordModal from './LogGrowthRecordModal'
import ChildGrowthPanel from './ChildGrowthPanel'

// Visible to health_worker (primary delivery channel — log MUAC/weight during
// a home visit) and superadmin (cross-facility coverage view). facility_admin,
// specialist, and driver don't get this tab — see the household/nutrition
// scoping decision.
export default function NutritionPage() {
  const [children, setChildren] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null) // child being logged/viewed

  const load = async (q = '') => {
    setLoading(true)
    try {
      const params = { patient_type: 'child' }
      if (q) params.q = q
      const { data } = await patientsApi.list(params)
      setChildren(Array.isArray(data) ? data : data.results || [])
    } catch {
      setError('Failed to load children.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    load(search)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <div>
        <h1 className="section-title">Nutrition</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Growth tracking and age-appropriate feeding guidance for children under five
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9"
            placeholder="Search children by name or hospital ID…"
          />
        </div>
        <button type="submit" className="btn-secondary px-4">Search</button>
      </form>

      {error && <Alert type="error" message={error}/>}

      {loading ? <PageSpinner/> : children.length === 0 ? (
        <EmptyState
          icon={Baby}
          title="No child records found"
          description="Register a child patient (patient type: Child) to start tracking growth and nutrition guidance."
        />
      ) : (
        <div className="space-y-2">
          {children.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="w-full text-left card px-5 py-4 flex items-center gap-4 hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
                <Baby size={20} className="text-brand-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{c.patient_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Age {c.age} · {c.household_name || 'No household'} · {c.town || 'Unknown town'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ChildGrowthPanel
          patient={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
