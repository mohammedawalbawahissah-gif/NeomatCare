/**
 * src/api/client.js
 * Axios client for NeoMatCare web frontend.
 * Generated from backend source: accounts, cases, consultations,
 * facilities, referrals, transport apps.
 */
import axios from 'axios'

export const BASE_URL = 'https://neomatcare-production.up.railway.app'

// ── Public client (no auth, no redirect) ─────────────────────────────────────
// Use this for unauthenticated endpoints like facilities list on RegisterPage.
// It never touches localStorage and never redirects to /login.
export const publicApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Authenticated client ──────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Attach access token to every request ─────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Helper: only redirect to /login from protected pages ─────────────────────
const PUBLIC_PATHS = ['/login', '/register']
function redirectToLogin() {
  if (!PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p))) {
    window.location.href = '/login'
  }
}

// ── Auto-refresh on 401 ───────────────────────────────────────────────────────
let isRefreshing = false
let queue = []

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
      original._retry = true
      isRefreshing = true
      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) {
        isRefreshing = false
        localStorage.clear()
        redirectToLogin()
        return Promise.reject(error)
      }
      try {
        const { data } = await axios.post(`${BASE_URL}/api/auth/token/refresh/`, { refresh })
        localStorage.setItem('access_token', data.access)
        if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
        queue.forEach(({ resolve }) => resolve(data.access))
        queue = []
        original.headers.Authorization = `Bearer ${data.access}`
        return api(original)
      } catch {
        queue.forEach(({ reject }) => reject(error))
        queue = []
        localStorage.clear()
        redirectToLogin()
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
// Endpoints: /api/auth/
// register   POST   { name, email, password, password2, role, facility? }
// login      POST   { email, password }
// refresh    POST   { refresh }
// logout     POST   { refresh }   — blacklists the refresh token
// me         GET    returns current user
// push-token POST   { token }     — Expo push token registration
export const authApi = {
  register:  (data)  => publicApi.post('/api/auth/register/', data),
  login:     (data)  => publicApi.post('/api/auth/login/', data),
  refresh:   (refresh) => publicApi.post('/api/auth/token/refresh/', { refresh }),
  logout:    (refresh) => api.post('/api/auth/logout/', { refresh }),
  me:             () => api.get('/api/auth/me/'),
  updateMe:       (data) => api.patch('/api/auth/me/', data),
  changePassword: (data) => api.post('/api/auth/change-password/', data),
  pushToken:      (token) => api.post('/api/auth/push-token/', { token }),
}

// ── Users ─────────────────────────────────────────────────────────────────────
// Endpoint: GET /api/auth/users/
// Query params: role, facility (UUID), search (name/email), is_active (true/false)
// Only accessible by facility_admin and superadmin roles
export const usersApi = {
  list:   (params)   => api.get('/api/auth/users/', { params }),
  create: (data)     => api.post('/api/auth/users/', data),
  update: (id, data) => api.patch(`/api/auth/users/${id}/`, data),
  delete: (id)       => api.delete(`/api/auth/users/${id}/`),
}

// ── Specialist Search ─────────────────────────────────────────────────────────
// Endpoint: GET /api/auth/specialists/search/?q=
// Returns up to 10 matching specialist users (min 2 chars)
export const specialistSearchApi = {
  search: (q) => api.get('/api/auth/specialists/search/', { params: { q } }),
}

// ── Cases ─────────────────────────────────────────────────────────────────────
// Endpoints: /api/cases/
//
// CREATE fields:
//   patient_name*, hospital_id, patient_phone_number, patient_age*,
//   patient_town, patient_blood_group, patient_anc_visits,
//   gestational_age_weeks, gravida, parity, presenting_complaint*,
//   danger_signs (array), vital_signs (object), fetal_heart_rate,
//   membranes_status, obstetric_history, referring_facility (UUID)
//
// UPDATE fields (PATCH):
//   gestational_age_weeks, gravida, parity, presenting_complaint,
//   danger_signs, vital_signs, fetal_heart_rate, membranes_status,
//   obstetric_history, referring_facility
//
// danger_signs valid codes:
//   PPH, APH, RUPTURED_UTERUS, ECLAMPSIA, SEVERE_PRE_ECLAMPSIA,
//   OBSTRUCTED_LABOUR, CORD_PROLAPSE, PUERPERAL_SEPSIS,
//   CHORIOAMNIONITIS, NEONATAL_DISTRESS, PRETERM_LABOUR,
//   NEONATAL_SEPSIS, SEVERE_ANAEMIA, MALPRESENTATION
//
// vital_signs keys:
//   systolic_bp, diastolic_bp, heart_rate, respiratory_rate, temperature, spo2
export const casesApi = {
  list:              ()         => api.get('/api/cases/'),
  create:            (data)     => api.post('/api/cases/', data),
  detail:            (id)       => api.get(`/api/cases/${id}/`),
  update:            (id, data) => api.patch(`/api/cases/${id}/`, data),
  triageNote:        (id, note) => api.post(`/api/cases/${id}/triage-note/`, { note }),
  suggestFacilities: (id)       => api.get(`/api/cases/${id}/suggest-facilities/`),
}

// ── Referrals ─────────────────────────────────────────────────────────────────
// Endpoints: /api/referrals/
//
// suggest:      POST  { emergency_case_id }
// create:       POST  { emergency_case_id*, receiving_facility_id*,
//                       engine_recommendation_id?, engine_version?,
//                       override_reason? (required if overriding engine) }
// updateStatus: PATCH { status*, note? }
//   Valid status values: DRAFT, PENDING, ACCEPTED, IN_TRANSIT,
//                        RECEIVED, COMPLETED, CANCELLED, FAILED
//   Valid transitions:
//     DRAFT      → PENDING, CANCELLED
//     PENDING    → ACCEPTED, CANCELLED
//     ACCEPTED   → IN_TRANSIT, CANCELLED
//     IN_TRANSIT → RECEIVED, FAILED
//     RECEIVED   → COMPLETED
// outcome:      PATCH { maternal_outcome*, neonatal_outcome*, outcome_notes? }
//   Outcome values: survived, died, unknown
//   Only allowed when status is RECEIVED or COMPLETED
export const referralsApi = {
  suggest:      (emergencyCaseId)       => api.post('/api/referrals/suggest/', { emergency_case_id: emergencyCaseId }),
  create:       (data)                  => api.post('/api/referrals/create/', data),
  list:         (params)                => api.get('/api/referrals/', { params }),
  detail:       (id)                    => api.get(`/api/referrals/${id}/`),
  updateStatus: (id, status, note = '') => api.patch(`/api/referrals/${id}/status/`, { status, note }),
  timeline:     (id)                    => api.get(`/api/referrals/${id}/timeline/`),
  outcome:      (id, data)              => api.patch(`/api/referrals/${id}/outcome/`, data),
}

// ── Consultations ─────────────────────────────────────────────────────────────
// Endpoints: /api/consultations/
//
// CREATE fields: { specialist (UUID)?, referral (UUID)?, notes?, status? }
// updateStatus:  PATCH { status?, notes? }
//   Status values: pending, active, completed, cancelled
//
// specialists:
//   CREATE fields: { professional_pin*, specialty*, years_experience?,
//                    qualification?, whatsapp_number?, is_available?,
//                    specialist_phone?, specialist_email?, bio?,
//                    emergency_contact?, facility (UUID)?,
//                    name? (links or creates display_name) }
//   specialty values: obstetrics, gynecology, neonatology, midwifery,
//                     anaesthesiology, internal_medicine, emergency_medicine, other
//
// messages:
//   SEND fields: { body* }  — sender and consultation set automatically
export const consultationsApi = {
  list:         (params)   => api.get('/api/consultations/', { params }),
  create:       (data)     => api.post('/api/consultations/', data),
  queue:        ()         => api.get('/api/consultations/queue/'),
  detail:       (id)       => api.get(`/api/consultations/${id}/`),
  updateStatus: (id, data) => api.patch(`/api/consultations/${id}/status/`, data),
  delete:       (id)       => api.delete(`/api/consultations/${id}/`),
  specialists: {
    list:      (params)     => api.get('/api/consultations/specialists/', { params }),
    create:    (data)       => api.post('/api/consultations/specialists/', data),
    detail:    (id)         => api.get(`/api/consultations/specialists/${id}/`),
    update:    (id, data)   => api.patch(`/api/consultations/specialists/${id}/`, data),
    available: ()           => api.get('/api/consultations/specialists/available/'),
    schedules: (id)         => api.get(`/api/consultations/specialists/${id}/schedules/`),
  },
  messages: {
    list: (id)       => api.get(`/api/consultations/${id}/messages/`),
    send: (id, body) => api.post(`/api/consultations/${id}/messages/`, { body }),
  },
}

// ── Facilities ────────────────────────────────────────────────────────────────
// Endpoints: /api/facilities/
//
// LIST query params (all optional):
//   lat, lng, radius_km (default 150) — filter by distance, sorted nearest first
//   level (1–6)  — 1=CHPS, 2=Health Centre, 3=District, 4=Regional,
//                  5=Teaching, 6=Private
//   has_theatre, has_blood_bank, has_nicu, has_icu, has_specialist (true/false)
//   is_active (default true)
//
// CREATE/UPDATE fields:
//   name*, level*, district, region, phone,
//   latitude*, longitude*,
//   available_services (array), icu_beds_available, nicu_cots_available,
//   theatre_available, blood_bank, on_call_specialist, is_active
//
// updateCapacity fields:
//   icu_beds_available, nicu_cots_available,
//   theatre_available, blood_bank, on_call_specialist
export const facilitiesApi = {
  // list() uses publicApi so RegisterPage can fetch facilities without a token.
  // All other facility operations require authentication.
  list:            (params)   => publicApi.get('/api/facilities/', { params }),
  create:          (data)     => api.post('/api/facilities/', data),
  detail:          (id)       => api.get(`/api/facilities/${id}/`),
  update:          (id, data) => api.patch(`/api/facilities/${id}/`, data),
  updateCapacity:  (id, data) => api.patch(`/api/facilities/${id}/capacity/`, data),
  capacityHistory: (id)       => api.get(`/api/facilities/${id}/capacity-history/`),
  delete:          (id)       => api.delete(`/api/facilities/${id}/`),
}

// ── Transport ─────────────────────────────────────────────────────────────────
// Endpoints: /api/transport/
//
// vehicles:
//   LIST   query params: vehicle_type, status, driver (UUID), search (registration/make/model)
//   CREATE fields: { registration*, vehicle_type*, make?, model?, year?,
//                    status?, driver (UUID)?, notes? }
//   vehicle_type values: ambulance, car, motorcycle, tricycle, truck, other
//   status values:       available, in_use, maintenance, inactive
//
// drivers (READ-ONLY — manage via Django admin):
//   LIST   query params: search (name/email)
//   Fields returned: id, name, email, license_number, is_available
//
// requests:
//   LIST   query params: status, vehicle (UUID), mine=true
//   CREATE fields: { vehicle (UUID)?, referral (UUID)?, notes?, status? }
//   updateStatus:  PATCH { status?, notes? }
//   status values: pending, assigned, completed, cancelled
export const transportApi = {
  vehicles: {
    list:      (params)   => api.get('/api/transport/vehicles/', { params }),
    create:    (data)     => api.post('/api/transport/vehicles/', data),
    detail:    (id)       => api.get(`/api/transport/vehicles/${id}/`),
    update:    (id, data) => api.patch(`/api/transport/vehicles/${id}/`, data),
    delete:    (id)       => api.delete(`/api/transport/vehicles/${id}/`),
    available: (params)   => api.get('/api/transport/vehicles/available/', { params }),
  },
  drivers: {
    list:   (params)   => api.get('/api/transport/drivers/', { params }),
    create: (data)     => api.post('/api/transport/drivers/', data),
    update: (id, data) => api.patch(`/api/transport/drivers/${id}/`, data),
    detail: (id)       => api.get(`/api/transport/drivers/${id}/`),
  },
  requests: {
    list:         (params)   => api.get('/api/transport/requests/', { params }),
    create:       (data)     => api.post('/api/transport/requests/', data),
    mine:         ()         => api.get('/api/transport/requests/', { params: { mine: true } }),
    detail:       (id)       => api.get(`/api/transport/requests/${id}/`),
    updateStatus: (id, data) => api.patch(`/api/transport/requests/${id}/status/`, data),
  },
}
