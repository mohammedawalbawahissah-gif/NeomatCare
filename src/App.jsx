import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import AppLayout from '@/components/layout/AppLayout'

import LoginPage           from '@/pages/auth/LoginPage'
import RegisterPage        from '@/pages/auth/RegisterPage'
import PatientRegisterPage from '@/pages/auth/PatientRegisterPage'
import DashboardPage       from '@/pages/DashboardPage'

import CasesPage      from '@/pages/health-worker/CasesPage'
import CaseDetailPage from '@/pages/health-worker/CaseDetailPage'

import { ReferralsPage, ReferralDetailPage } from '@/pages/referrals/ReferralsPage'

import { ConsultationsPage, ConsultationDetailPage } from '@/pages/specialist/ConsultationsPage'

import { TransportPage, MyDispatchesPage } from '@/pages/driver/TransportPage'

import FacilityPage from '@/pages/facility-admin/FacilityPage'

import FacilitiesPage from '@/pages/superadmin/FacilitiesPage'
import UsersPage      from '@/pages/superadmin/UsersPage'

import ProfilePage from '@/pages/ProfilePage'

import PatientPortalPage from '@/pages/patient/PatientPortalPage'

import NotFoundPage from '@/pages/NotFoundPage'

// ── Guards ────────────────────────────────────────────────────────────────────
function RequireAuth() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <AppLayout><Outlet /></AppLayout>
}

function RequireRole({ allowed }) {
  const { role } = useAuth()
  if (!allowed.includes(role)) {
    // Redirect patients to their portal, others to dashboard
    return <Navigate to={role === 'patient' ? '/app/portal' : '/app/dashboard'} replace />
  }
  return <Outlet />
}

function RedirectIfAuth() {
  const { isAuthenticated, loading, role } = useAuth()
  if (loading) return null
  if (isAuthenticated) return <Navigate to={role === 'patient' ? '/app/portal' : '/app/dashboard'} replace />
  return <Outlet />
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* PUBLIC */}
          <Route element={<RedirectIfAuth />}>
            <Route path="/login"            element={<LoginPage />} />
            <Route path="/register"         element={<RegisterPage />} />
            <Route path="/patient-register" element={<PatientRegisterPage />} />
          </Route>

          {/* ROOT */}
          <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

          {/* PROTECTED */}
          <Route path="/app" element={<RequireAuth />}>
            <Route index element={<Navigate to="dashboard" replace />} />

            {/* Dashboard — redirect patients away */}
            <Route path="dashboard" element={<RoleAwareDashboard />} />

            {/* PROFILE — all authenticated users */}
            <Route path="profile" element={<ProfilePage />} />

            {/* PATIENT PORTAL */}
            <Route element={<RequireRole allowed={['patient']} />}>
              <Route path="portal" element={<PatientPortalPage />} />
            </Route>

            {/* CASES — health_worker, facility_admin, superadmin */}
            <Route element={<RequireRole allowed={['health_worker','facility_admin','superadmin']} />}>
              <Route path="cases"     element={<CasesPage />} />
              <Route path="cases/:id" element={<CaseDetailPage />} />
            </Route>

            {/* REFERRALS — health_worker, facility_admin, superadmin */}
            <Route element={<RequireRole allowed={['health_worker','facility_admin','superadmin']} />}>
              <Route path="referrals"     element={<ReferralsPage />} />
              <Route path="referrals/:id" element={<ReferralDetailPage />} />
            </Route>

            {/* CONSULTATIONS — health_worker, specialist, superadmin */}
            <Route element={<RequireRole allowed={['health_worker','specialist','superadmin']} />}>
              <Route path="consultations"     element={<ConsultationsPage />} />
              <Route path="consultations/:id" element={<ConsultationDetailPage />} />
            </Route>

            {/* TRANSPORT — health_worker, facility_admin, driver, superadmin */}
            <Route element={<RequireRole allowed={['health_worker','facility_admin','driver','superadmin']} />}>
              <Route path="transport"      element={<TransportPage />} />
              <Route path="transport/mine" element={<MyDispatchesPage />} />
            </Route>

            {/* FACILITY ADMIN — facility_admin, superadmin */}
            <Route element={<RequireRole allowed={['facility_admin','superadmin']} />}>
              <Route path="facility" element={<FacilityPage />} />
            </Route>

            {/* USERS — superadmin + facility_admin */}
            <Route element={<RequireRole allowed={['superadmin','facility_admin']} />}>
              <Route path="users" element={<UsersPage />} />
            </Route>

            {/* SUPERADMIN only */}
            <Route element={<RequireRole allowed={['superadmin']} />}>
              <Route path="facilities" element={<FacilitiesPage />} />
            </Route>
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

// Inline helper — sends patients to portal, others see the real dashboard
function RoleAwareDashboard() {
  const { role } = useAuth()
  if (role === 'patient') return <Navigate to="/app/portal" replace />
  return <DashboardPage />
}
