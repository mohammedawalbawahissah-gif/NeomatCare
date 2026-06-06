import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import AppLayout from '@/components/layout/AppLayout'

import LoginPage    from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import DashboardPage from '@/pages/DashboardPage'

import CasesPage      from '@/pages/health-worker/CasesPage'
import CaseDetailPage from '@/pages/health-worker/CaseDetailPage'

import { ReferralsPage, ReferralDetailPage } from '@/pages/referrals/ReferralsPage'

import { ConsultationsPage, ConsultationDetailPage } from '@/pages/specialist/ConsultationsPage'

import { TransportPage, MyDispatchesPage } from '@/pages/driver/TransportPage'

import FacilityPage from '@/pages/facility-admin/FacilityPage'

import FacilitiesPage from '@/pages/superadmin/FacilitiesPage'
import UsersPage      from '@/pages/superadmin/UsersPage'

import ProfilePage from '@/pages/ProfilePage'
import PatientsPage     from '@/pages/patients/PatientsPage'
import PatientDetailPage from '@/pages/patients/PatientDetailPage'

import NotFoundPage from '@/pages/NotFoundPage'

// ── Guards ────────────────────────────────────────────────────────────────────
function RequireAuth() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <AppLayout><Outlet /></AppLayout>
}

// Role values match backend User.Role choices exactly:
// superadmin, facility_admin, health_worker, specialist, driver
function RequireRole({ allowed }) {
  const { role } = useAuth()
  if (!allowed.includes(role)) return <Navigate to="/app/dashboard" replace />
  return <Outlet />
}

function RedirectIfAuth() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (isAuthenticated) return <Navigate to="/app/dashboard" replace />
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
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* ROOT */}
          <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

          {/* PROTECTED */}
          <Route path="/app" element={<RequireAuth />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />

            {/* PROFILE — all authenticated users */}
            <Route path="profile" element={<ProfilePage />} />

            {/* CASES — health_worker, facility_admin, superadmin */}
            <Route element={<RequireRole allowed={['health_worker','facility_admin','superadmin']} />}>
              <Route path="cases"     element={<CasesPage />} />
              <Route path="cases/:id" element={<CaseDetailPage />} />
            </Route>

            {/* PATIENTS — health_worker, facility_admin, superadmin, patient (portal) */}
            <Route element={<RequireRole allowed={['health_worker','facility_admin','superadmin','patient']} />}>
              <Route path="patients"     element={<PatientsPage />} />
              <Route path="patients/:id" element={<PatientDetailPage />} />
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

            {/* USERS — superadmin + facility_admin (backend filters by facility for facility_admin) */}
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
