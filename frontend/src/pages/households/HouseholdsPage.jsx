import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { householdsApi } from '@/api/client'
import { PageSpinner, Alert, EmptyState, Spinner } from '@/components/ui'
import { Home, Plus, Users, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import CreateHouseholdModal from './CreateHouseholdModal'

const RISK_COLORS = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-emerald-100 text-emerald-700',
}

const FOOD_SECURITY_LABELS = {
  secure:   { label: 'Food secure',   className: 'bg-emerald-100 text-emerald-700' },
  at_risk:  { label: 'At risk',       className: 'bg-amber-100 text-amber-700' },
  insecure: { label: 'Food insecure', className: 'bg-red-100 text-red-700' },
  unknown:  { label: 'Unknown',       className: 'bg-slate-100 text-slate-500' },
}

// Shared across health_worker (own caseload), facility_admin (facility-wide),
// and superadmin (cross-facility) — the backend already scopes the list by
// role, so this one component covers all three; only what a worker can
// create/see differs.
export default function HouseholdsPage() {
  const navigate = useNavigate()
  const { isHealthWorker, isFacilityAdmin, isSuperAdmin } = useAuth()

  const [households, setHouseholds] = useState([])
  const [loading,     setLoading]   = useState(true)
  const [error,       setError]     = useState('')
  const [createOpen,  setCreateOpen] = useState(false)

  const canCreate = isHealthWorker || isFacilityAdmin || isSuperAdmin

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await householdsApi.list()
      setHouseholds(Array.isArray(data) ? data : data.results || [])
    } catch {
      setError('Failed to load households.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">Households</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Compounds ranked by highest member risk — prioritise who to visit first
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={15}/> New Household
          </button>
        )}
      </div>

      {error && <Alert type="error" message={error}/>}

      {loading ? <PageSpinner/> : households.length === 0 ? (
        <EmptyState
          icon={Home}
          title="No households found"
          description="Households group patients registered at the same compound, so a worker can prioritise a whole family in one pass."
          action={canCreate && <button onClick={() => setCreateOpen(true)} className="btn-primary text-sm">New Household</button>}
        />
      ) : (
        <div className="space-y-2">
          {households.map(h => {
            const food = FOOD_SECURITY_LABELS[h.food_security_flag] || FOOD_SECURITY_LABELS.unknown
            return (
              <div
                key={h.id}
                onClick={() => navigate(`/app/households/${h.id}`)}
                className="card px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
                  <Home size={20} className="text-brand-600"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800 text-sm truncate">{h.head_name || 'Unnamed household'}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${RISK_COLORS[h.aggregate_risk_level] || 'bg-slate-100 text-slate-500'}`}>
                      {h.aggregate_risk_level} risk
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${food.className}`}>
                      {food.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {h.town || 'Unknown town'} · {h.facility_name || 'No facility'}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-1.5 text-slate-500">
                  <Users size={15}/>
                  <span className="text-sm font-medium">{h.member_count}</span>
                </div>
                {h.aggregate_risk_level === 'high' && (
                  <AlertTriangle size={16} className="text-red-500 shrink-0"/>
                )}
              </div>
            )
          })}
        </div>
      )}

      <CreateHouseholdModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load() }}
        onQueued={() => setCreateOpen(false)}
      />
    </div>
  )
}
