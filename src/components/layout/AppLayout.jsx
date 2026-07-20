import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { notificationsApi } from '@/api/client'
import {
  LayoutDashboard, ClipboardList, ArrowRightLeft, Truck,
  Video, Building2, Users, LogOut, Menu, X, Heart,
  ChevronRight, Bell, Baby, Star, PhoneCall, HeartPulse, UserCircle,
  Settings, CheckCheck,
} from 'lucide-react'
import clsx from 'clsx'
import AssistantWidget from '@/components/ai/AssistantWidget'
import SyncQueueIndicator from '@/components/sync/SyncQueueIndicator'

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
  patient:        'Health Companion',
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifLoading, setNotifLoading] = useState(false)
  const notifRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const refreshUnreadCount = async () => {
    try {
      const { data } = await notificationsApi.unreadCount()
      setUnreadCount(data.unread_count)
    } catch {
      // Silently ignore — the bell just won't show a badge this cycle
    }
  }

  useEffect(() => {
    refreshUnreadCount()
    const interval = setInterval(refreshUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  const toggleNotifications = async () => {
    const opening = !notifOpen
    setNotifOpen(opening)
    if (opening) {
      setNotifLoading(true)
      try {
        const { data } = await notificationsApi.list()
        setNotifications(data.results || data)
      } catch {
        setNotifications([])
      } finally {
        setNotifLoading(false)
      }
    }
  }

  const handleNotificationClick = async (n) => {
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.id)
        setUnreadCount(c => Math.max(0, c - 1))
        setNotifications(list => list.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      } catch {}
    }
    setNotifOpen(false)
    if (n.url) navigate(n.url)
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      setUnreadCount(0)
      setNotifications(list => list.map(x => ({ ...x, is_read: true })))
    } catch {}
  }

  const timeAgo = (iso) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

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
          <SyncQueueIndicator />
          <div className="relative" ref={notifRef}>
            <button
              onClick={toggleNotifications}
              className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-0.5 bg-danger-500 rounded-full text-[9px] text-white font-semibold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50 max-h-96 flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 shrink-0">
                  <p className="text-sm font-semibold text-slate-900">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      <CheckCheck size={13} />
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto">
                  {notifLoading && (
                    <p className="px-4 py-6 text-sm text-slate-400 text-center">Loading…</p>
                  )}
                  {!notifLoading && notifications.length === 0 && (
                    <p className="px-4 py-6 text-sm text-slate-400 text-center">No notifications yet</p>
                  )}
                  {!notifLoading && notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={clsx(
                        'flex flex-col items-start gap-0.5 w-full px-4 py-3 text-left border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors',
                        !n.is_read && 'bg-brand-50/50'
                      )}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                        <p className={clsx('text-sm truncate', n.is_read ? 'font-normal text-slate-700' : 'font-semibold text-slate-900')}>
                          {n.title}
                        </p>
                      </div>
                      {n.message && (
                        <p className="text-xs text-slate-500 line-clamp-2 pl-3.5">{n.message}</p>
                      )}
                      <p className="text-[10px] text-slate-400 pl-3.5">{timeAgo(n.created_at)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen(o => !o)}
              className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-sm font-semibold hover:ring-2 hover:ring-brand-200 transition-shadow"
            >
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 top-11 w-56 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { setProfileMenuOpen(false); navigate('/app/profile') }}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings size={15} />
                  Edit Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            )}
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
