import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { casesApi, referralsApi, transportApi, consultationsApi } from '@/api/client'
import { StatCard, StatusBadge, PageSpinner, DangerSignList } from '@/components/ui'
import { ClipboardList, ArrowRightLeft, Truck, Video, AlertTriangle, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Link, Navigate } from 'react-router-dom'

// ── Health Worker Dashboard ───────────────────────────────────────────────────
function HealthWorkerDashboard() {
  const [cases, setCases]         = useState([])
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([casesApi.list(), referralsApi.list()])
      .then(([c, r]) => {
        setCases(Array.isArray(c.data) ? c.data : c.data.results || [])
        setReferrals(Array.isArray(r.data) ? r.data : r.data.results || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  const active = referrals.filter(r => !['COMPLETED','CANCELLED','FAILED'].includes(r.status))

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Your active cases and referrals</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Cases"        value={cases.length}                                        icon={ClipboardList}  color="brand" />
        <StatCard label="Active Referrals" value={active.length}                                      icon={ArrowRightLeft}  color="blue" />
        <StatCard label="Total Referrals"  value={referrals.length}                                   icon={ArrowRightLeft}  color="slate" />
        <StatCard label="Completed"        value={referrals.filter(r=>r.status==='COMPLETED').length} icon={ClipboardList}  color="brand" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-medium text-slate-800">Recent Cases</h2>
            <Link to="/app/cases" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {cases.slice(0, 5).map(c => (
              <Link key={c.id} to={`/app/cases/${c.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 bg-danger-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle size={14} className="text-danger-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{c.patient_name || 'Patient'} · {c.patient_age}y</p>
                  <DangerSignList signs={c.danger_signs} />
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Clock size={10} /> {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>
            ))}
            {cases.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No cases yet</p>}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-medium text-slate-800">Active Referrals</h2>
            <Link to="/app/referrals" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {active.slice(0, 5).map(r => (
              <Link key={r.id} to={`/app/referrals/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.receiving_facility_name}</p>
                  <p className="text-xs text-slate-400 truncate">From {r.referring_facility_name}</p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
            {active.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No active referrals</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Specialist Dashboard ──────────────────────────────────────────────────────
function SpecialistDashboard() {
  const [queue, setQueue]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    consultationsApi.queue()
      .then(({ data }) => setQueue(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  // Real statuses: pending, active, completed, cancelled
  const pending    = queue.filter(q => q.status === 'pending')
  const inProgress = queue.filter(q => q.status === 'active')

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">Consultation Queue</h1>
        <p className="text-slate-500 text-sm mt-1">Incoming consultation requests</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Pending"    value={pending.length}    icon={Video} color="amber" />
        <StatCard label="In Progress" value={inProgress.length} icon={Video} color="blue" />
        <StatCard label="Total Queue" value={queue.length}      icon={Video} color="slate" />
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-medium text-slate-800">Active Requests</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {queue.map(c => (
            <Link key={c.id} to={`/app/consultations/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                <Video size={16} className="text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">Consultation request</p>
                <p className="text-xs text-slate-400">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</p>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          ))}
          {queue.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Queue is clear</p>}
        </div>
      </div>
    </div>
  )
}

// ── Driver Dashboard ──────────────────────────────────────────────────────────
function DriverDashboard() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    // mine=true scopes requests to the current driver
    transportApi.requests.mine()
      .then(({ data }) => setRequests(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  const active    = requests.filter(r => !['completed','cancelled'].includes(r.status))
  const completed = requests.filter(r => r.status === 'completed')

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">My Dispatches</h1>
        <p className="text-slate-500 text-sm mt-1">Your transport assignments</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Active"    value={active.length}    icon={Truck} color="amber" />
        <StatCard label="Completed" value={completed.length} icon={Truck} color="brand" />
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-medium text-slate-800">Active Assignments</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {active.map(r => (
            <Link key={r.id} to="/app/transport/mine" className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                <Truck size={16} className="text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                {/* TransportRequest has vehicle_registration and notes — no facility name fields */}
                <p className="text-sm font-medium text-slate-800">{r.vehicle_registration || 'Vehicle TBD'}</p>
                <p className="text-xs text-slate-400 truncate">{r.notes || 'No notes'}</p>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
          {active.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No active assignments</p>}
        </div>
      </div>
    </div>
  )
}

// ── Facility Admin Dashboard ──────────────────────────────────────────────────
function FacilityAdminDashboard() {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    referralsApi.list()
      .then(({ data }) => setReferrals(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  const incoming = referrals.filter(r => ['PENDING','ACCEPTED'].includes(r.status))

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">Facility Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Incoming referrals and capacity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Incoming"       value={incoming.length}                                      icon={ArrowRightLeft} color="amber" />
        <StatCard label="In Transit"     value={referrals.filter(r=>r.status==='IN_TRANSIT').length}  icon={Truck}          color="blue" />
        <StatCard label="Completed"      value={referrals.filter(r=>r.status==='COMPLETED').length}   icon={ClipboardList}  color="brand" />
        <StatCard label="Total"          value={referrals.length}                                     icon={ArrowRightLeft} color="slate" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-medium text-slate-800">Pending Referrals</h2>
          <Link to="/app/referrals" className="text-xs text-brand-600 hover:underline">View all</Link>
        </div>
        <div className="divide-y divide-slate-50">
          {incoming.slice(0, 8).map(r => (
            <Link key={r.id} to={`/app/referrals/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">From {r.referring_facility_name}</p>
                <p className="text-xs text-slate-400">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
          {incoming.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No pending referrals</p>}
        </div>
      </div>
    </div>
  )
}

// ── Superadmin Dashboard ──────────────────────────────────────────────────────
function SuperadminDashboard() {
  const [cases, setCases]         = useState([])
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([casesApi.list(), referralsApi.list()])
      .then(([c, r]) => {
        setCases(Array.isArray(c.data) ? c.data : c.data.results || [])
        setReferrals(Array.isArray(r.data) ? r.data : r.data.results || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">System Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Platform-wide activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Cases"     value={cases.length}                                                              icon={ClipboardList}  color="brand" />
        <StatCard label="Total Referrals" value={referrals.length}                                                          icon={ArrowRightLeft}  color="blue" />
        <StatCard label="Active Referrals" value={referrals.filter(r=>!['COMPLETED','CANCELLED','FAILED'].includes(r.status)).length} icon={ArrowRightLeft} color="amber" />
        <StatCard label="Completed"       value={referrals.filter(r=>r.status==='COMPLETED').length}                        icon={ClipboardList}  color="slate" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-medium text-slate-800">Recent Cases</h2>
            <Link to="/app/cases" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {cases.slice(0, 6).map(c => (
              <Link key={c.id} to={`/app/cases/${c.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{c.referring_facility_name} · {c.patient_age}y</p>
                  <DangerSignList signs={c.danger_signs} />
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap shrink-0">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-medium text-slate-800">Recent Referrals</h2>
            <Link to="/app/referrals" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {referrals.slice(0, 6).map(r => (
              <Link key={r.id} to={`/app/referrals/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.referring_facility_name} → {r.receiving_facility_name}</p>
                  <p className="text-xs text-slate-400">{r.created_by_name}</p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Route to the correct dashboard by role ────────────────────────────────────
// Role values match backend User.Role choices exactly
export default function DashboardPage() {
  const { role } = useAuth()
  if (role === 'specialist')    return <SpecialistDashboard />
  if (role === 'driver')        return <DriverDashboard />
  if (role === 'facility_admin') return <FacilityAdminDashboard />
  if (role === 'superadmin')    return <SuperadminDashboard />
  return <HealthWorkerDashboard />   // health_worker (default)
}
