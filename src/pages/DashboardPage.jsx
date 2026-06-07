import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { casesApi, referralsApi, transportApi, consultationsApi } from '@/api/client'
import { StatCard, StatusBadge, PageSpinner, DangerSignList } from '@/components/ui'
import { ClipboardList, ArrowRightLeft, Truck, Video, AlertTriangle, Clock } from 'lucide-react', UserCircle, Calendar }
import { formatDistanceToNow } from 'date-fns'
import { Link, Navigate } from 'react-router-dom'

// ── Health Worker Dashboard ───────────────────────────────────────────────────
// ── Follow-up Scheduling ─────────────────────────────────────────────────────
function FollowUpSection({ followUps, patients, onAdd, onComplete }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ patientName:'', patientId:'', note:'', dueDate:'' })

  const handleAdd = (e) => {
    e.preventDefault()
    if (!form.patientName.trim()) return
    onAdd(form.patientName, form.patientId || null, form.note, form.dueDate)
    setForm({ patientName:'', patientId:'', note:'', dueDate:'' })
    setShowForm(false)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-medium text-slate-800 flex items-center gap-2">
            <Calendar size={16} className="text-brand-600" /> Follow-up Schedule
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Post-discharge check-ins and postnatal care tasks</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-secondary text-xs px-3 py-1.5">
          + Add Follow-up
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="px-5 py-4 border-b border-slate-50 bg-slate-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Patient Name <span className="text-red-500">*</span></label>
              <input
                required list="patient-suggestions"
                value={form.patientName} onChange={e => {
                  const name = e.target.value
                  const match = patients.find(p => p.patient_name === name)
                  setForm(f => ({ ...f, patientName: name, patientId: match?.id || '' }))
                }}
                placeholder="Patient name…"
                className="input-field text-sm"
              />
              <datalist id="patient-suggestions">
                {patients.map(p => <option key={p.id} value={p.patient_name}/>)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))} className="input-field text-sm"/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Follow-up Note</label>
            <input value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} placeholder="e.g. Postnatal check at 6 weeks, BP monitoring…" className="input-field text-sm"/>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-xs flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary text-xs flex-1 justify-center">Schedule Follow-up</button>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-50">
        {followUps.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No pending follow-ups</p>
        )}
        {followUps.map(task => {
          const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
          return (
            <div key={task.id} className="flex items-start gap-3 px-5 py-3.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isOverdue ? 'bg-red-50' : 'bg-brand-50'}`}>
                <Calendar size={14} className={isOverdue ? 'text-red-500' : 'text-brand-600'}/>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-800">{task.patientName}</p>
                  {task.patientId && (
                    <Link to={`/app/patients/${task.patientId}`} className="text-xs text-brand-600 hover:underline">View profile</Link>
                  )}
                  {isOverdue && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Overdue</span>}
                </div>
                {task.note && <p className="text-xs text-slate-500 mt-0.5">{task.note}</p>}
                {task.dueDate && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <Clock size={9}/> Due {new Date(task.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button onClick={() => onComplete(task.id)} className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0 mt-0.5 px-2 py-1 rounded hover:bg-brand-50 transition-colors">
                Done
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HealthWorkerDashboard() {
  const [cases,     setCases]     = useState([])
  const [referrals, setReferrals] = useState([])
  const [patients,  setPatients]  = useState([])
  const [followUps, setFollowUps] = useState([]) // localStorage-backed follow-up tasks
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    // Load follow-ups from localStorage
    const stored = JSON.parse(localStorage.getItem('neomatcare_followups') || '[]')
    setFollowUps(stored.filter(f => !f.completed))

    Promise.all([casesApi.list(), referralsApi.list(), patientsApi.list({ risk_level: 'high' })])
      .then(([c, r, p]) => {
        setCases(Array.isArray(c.data) ? c.data : c.data.results || [])
        setReferrals(Array.isArray(r.data) ? r.data : r.data.results || [])
        setPatients(Array.isArray(p.data) ? p.data : p.data.results || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const addFollowUp = (patientName, patientId, note, dueDate) => {
    const task = { id: Date.now(), patientName, patientId, note, dueDate, completed: false, createdAt: new Date().toISOString() }
    const all = JSON.parse(localStorage.getItem('neomatcare_followups') || '[]')
    all.push(task)
    localStorage.setItem('neomatcare_followups', JSON.stringify(all))
    setFollowUps(prev => [...prev, task])
  }

  const completeFollowUp = (taskId) => {
    const all = JSON.parse(localStorage.getItem('neomatcare_followups') || '[]')
    const updated = all.map(f => f.id === taskId ? { ...f, completed: true } : f)
    localStorage.setItem('neomatcare_followups', JSON.stringify(updated))
    setFollowUps(prev => prev.filter(f => f.id !== taskId))
  }

  if (loading) return <PageSpinner />

  const active = referrals.filter(r => !['COMPLETED','CANCELLED','FAILED'].includes(r.status))
  const overdue = followUps.filter(f => f.dueDate && new Date(f.dueDate) < new Date())

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Your active cases and referrals</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Cases"         value={cases.length}                                        icon={ClipboardList} color="brand" />
        <StatCard label="Active Referrals"  value={active.length}                                      icon={ArrowRightLeft} color="blue" />
        <StatCard label="High-Risk Patients" value={patients.length}                                   icon={UserCircle}    color="amber" />
        <StatCard label="Follow-ups Due"    value={followUps.length}                                   icon={Calendar}      color={overdue.length > 0 ? 'danger' : 'brand'} />
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

      {/* Follow-up Scheduling */}
      <FollowUpSection followUps={followUps} patients={patients} onAdd={addFollowUp} onComplete={completeFollowUp} />
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
