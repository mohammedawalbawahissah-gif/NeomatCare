import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import AssistantWidget from '@/components/ai/AssistantWidget'
import {
  LayoutDashboard, ClipboardList, ArrowRightLeft, Truck,
  Video, Building2, Users, LogOut, Menu, X, Heart,
  ChevronRight, Bell, Baby, Star, PhoneCall, HeartPulse, UserCircle, UserCog,
} from 'lucide-react'
import clsx from 'clsx'

const NAV_BY_ROLE = {
  health_worker: [
    { to: '/app/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
    { to: '/app/patients',       label: 'Patients',       icon: UserCircle },
    { to: '/app/cases',          label: 'Cases',          icon: ClipboardList },
    { to: '/app/referrals',      label: 'Referrals',      icon: ArrowRightLeft },
    { to: '/app/consultations',  label: 'Consultations',  icon: Video },
    { to: '/app/transport',      label: 'Transport',      icon: Truck },
  ],
  facility_admin: [
    { to: '/app/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
    { to: '/app/patients',       label: 'Patients',       icon: UserCircle },
    { to: '/app/referrals',      label: 'Referrals',      icon: ArrowRightLeft },
    { to: '/app/facility',       label: 'My Facility',    icon: Building2 },
    { to: '/app/transport',      label: 'Transport',      icon: Truck },
  ],
  specialist: [
    { to: '/app/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
    { to: '/app/consultations',  label: 'My Queue',       icon: Video },
  ],
  driver: [
    { to: '/app/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
    { to: '/app/transport/mine', label: 'My Dispatches',  icon: Truck },
  ],
  superadmin: [
    { to: '/app/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
    { to: '/app/cases',          label: 'All Cases',      icon: ClipboardList },
    { to: '/app/patients',       label: 'Patients',       icon: UserCircle },
    { to: '/app/referrals',      label: 'All Referrals',  icon: ArrowRightLeft },
    { to: '/app/facilities',     label: 'Facilities',     icon: Building2 },
    { to: '/app/consultations',  label: 'Consultations',  icon: Video },
    { to: '/app/transport',      label: 'Transport',      icon: Truck },
    { to: '/app/users',          label: 'Users',          icon: Users },
  ],
  patient: [
    { to: '/app/portal',                label: 'My Portal',         icon: Heart        },
    { to: '/app/portal#pregnancy',      label: 'Pregnancy Guide',   icon: Baby         },
    { to: '/app/portal#reviews',        label: 'My Reviews',        icon: Star         },
    { to: '/app/portal#oncall',         label: 'On-Call',           icon: PhoneCall    },
    { to: '/app/portal#transport',      label: 'Transport',         icon: Truck        },
    { to: '/app/portal#health',         label: 'My Health',         icon: HeartPulse   },
  ],
}

const ROLE_LABELS = {
  health_worker:  'Health Worker',
  facility_admin: 'Facility Admin',
  specialist:     'Specialist',
  driver:         'Driver',
  superadmin:     'Superadmin',
  patient:        'Patient',
}

const ROLE_COLORS = {
  health_worker:  'bg-brand-100 text-brand-700',
  facility_admin: 'bg-blue-100 text-blue-700',
  specialist:     'bg-purple-100 text-purple-700',
  driver:         'bg-amber-100 text-amber-700',
  superadmin:     'bg-danger-100 text-danger-700',
  patient:        'bg-green-100 text-green-800',
}

export default function AppLayout({ children }) {
  const { user, logout, role } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // For patient: portal tab links use hash anchors — match only the /app/portal prefix
  const isPatient = role === 'patient'
  const nav = (NAV_BY_ROLE[role] || []).filter((item, i) => {
    // For patient, only show the first item (My Portal) in sidebar — rest are tab-level
    return isPatient ? i === 0 : true
  })

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 flex flex-col transition-transform duration-300 ease-in-out',
        'lg:relative lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shadow-glow-green shrink-0">
            <Heart size={16} className="text-white" fill="white" />
          </div>
          <div>
            <p className="font-display text-white text-base leading-tight">NeoMatCare</p>
            <p className="text-slate-500 text-[10px] leading-tight">
              {isPatient ? 'Patient Portal' : 'Emergency Referral System'}
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="ml-auto lg:hidden text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/app/dashboard' || to === '/app/portal'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon size={17} className="shrink-0" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={13} className="opacity-0 group-hover:opacity-40 transition-opacity" />
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-slate-800">
          {/* Identity card */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800 mb-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate leading-tight">{user?.name}</p>
              <span className={clsx('inline-block text-[10px] px-1.5 py-0.5 rounded font-medium mt-0.5', ROLE_COLORS[role])}>
                {ROLE_LABELS[role]}
              </span>
            </div>
          </div>
          {/* Profile link — available to every role */}
          <NavLink
            to="/app/profile"
            onClick={() => setOpen(false)}
            className={({ isActive }) => clsx(
              'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors mb-1',
              isActive
                ? 'bg-brand-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            )}
          >
            <UserCog size={15} />
            Edit Profile
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-100 flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <button className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-danger-500 rounded-full" />
          </button>
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-sm font-semibold">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="page-enter">
            {children}
          </div>
        </main>
      </div>

      {/* Floating AI Assistant — role-aware, available across all portals */}
      <AssistantWidget />
    </div>
  )
}
