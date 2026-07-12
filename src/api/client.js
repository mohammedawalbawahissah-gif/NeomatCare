/**
 * src/api/client.js
 * Axios client for NeoMatCare web frontend.
 */
import axios from 'axios'

export const BASE_URL = import.meta.env.VITE_API_URL

if (!BASE_URL) {
  // Fails loudly in dev/build rather than silently hitting a stale backend URL.
  // Set VITE_API_URL in your .env.local (dev) or in Render's static site
  // environment variables (production) before building.
  console.error(
    'VITE_API_URL is not set. API requests will fail until it is configured.'
  )
}

// ── Public client (no auth, no redirect) ─────────────────────────────────────
export const publicApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Authenticated client ──────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const PUBLIC_PATHS = ['/login', '/register', '/patient-register']
function redirectToLogin() {
  if (!PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p))) {
    window.location.href = '/login'
  }
}

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
      original._retry  = true
      isRefreshing     = true
      const refresh    = localStorage.getItem('refresh_token')
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
export const authApi = {
  register:       (data)    => publicApi.post('/api/auth/register/', data),
  verifyOtp:      (data)    => publicApi.post('/api/auth/verify-otp/', data),
  resendOtp:      (data)    => publicApi.post('/api/auth/resend-otp/', data),
  login:          (data)    => publicApi.post('/api/auth/login/', data),
  refresh:        (refresh) => publicApi.post('/api/auth/token/refresh/', { refresh }),
  logout:         (refresh) => api.post('/api/auth/logout/', { refresh }),
  me:             ()        => api.get('/api/auth/me/'),
  updateMe:       (data)    => api.patch('/api/auth/me/', data),
  changePassword: (data)    => api.post('/api/auth/change-password/', data),
  pushToken:      (token)   => api.post('/api/auth/push-token/', { token }),
}

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:          ()     => api.get('/api/notifications/'),
  unreadCount:   ()     => api.get('/api/notifications/unread-count/'),
  markRead:      (id)   => api.post(`/api/notifications/${id}/read/`),
  markAllRead:   ()     => api.post('/api/notifications/mark-all-read/'),
}

// ── Wellness (pregnancy tracker + cycle tracker) ───────────────────────────────
export const wellnessApi = {
  myPregnancy:      ()     => api.get('/api/wellness/pregnancy/me/'),
  listCycleEntries: ()     => api.get('/api/wellness/cycle/'),
  addCycleEntry:    (data) => api.post('/api/wellness/cycle/', data),
  cyclePrediction:  ()     => api.get('/api/wellness/cycle/prediction/'),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  list:   (params)   => api.get('/api/auth/users/', { params }),
  create: (data)     => api.post('/api/auth/users/', data),
  update: (id, data) => api.patch(`/api/auth/users/${id}/`, data),
  delete: (id)       => api.delete(`/api/auth/users/${id}/`),
}

// ── Specialist Search ─────────────────────────────────────────────────────────
export const specialistSearchApi = {
  search: (q) => api.get('/api/auth/specialists/search/', { params: { q } }),
}

// ── Patient portal ────────────────────────────────────────────────────────────
export const patientApi = {
  me:            ()      => api.get('/api/auth/patient/me/'),
  reviews:       {
    list:   ()     => api.get('/api/auth/patient/reviews/'),
    create: (data) => api.post('/api/auth/patient/reviews/', data),
  },
}


// ── Patients ──────────────────────────────────────────────────────────────────
export const patientsApi = {
  list:        (params)   => api.get('/api/cases/patients/', { params }),
  create:      (data)     => api.post('/api/cases/patients/', data),
  detail:      (id)       => api.get(`/api/cases/patients/${id}/`),
  update:      (id, data) => api.patch(`/api/cases/patients/${id}/`, data),
  delete:      (id)       => api.delete(`/api/cases/patients/${id}/`),
  cases:       (id)       => api.get(`/api/cases/patients/${id}/cases/`),
  computeRisk: (id)       => api.post(`/api/cases/patients/${id}/compute-risk/`),
  ancVisits: {
    list:   (patientId)                    => api.get(`/api/cases/patients/${patientId}/anc-visits/`),
    create: (patientId, data)              => api.post(`/api/cases/patients/${patientId}/anc-visits/`, data),
    update: (patientId, visitId, data)     => api.patch(`/api/cases/patients/${patientId}/anc-visits/${visitId}/`, data),
    delete: (patientId, visitId)           => api.delete(`/api/cases/patients/${patientId}/anc-visits/${visitId}/`),
  },
  consent: {
    list:   (patientId)        => api.get(`/api/cases/patients/${patientId}/consent/`),
    record: (patientId, data)  => api.post(`/api/cases/patients/${patientId}/consent/`, data),
  },
  portal: {
    grant:  (patientId, data)  => api.post(`/api/cases/patients/${patientId}/grant-portal/`, data),
    revoke: (patientId)        => api.post(`/api/cases/patients/${patientId}/revoke-portal/`),
  },
}

// ── Cases ─────────────────────────────────────────────────────────────────────
export const casesApi = {
  list:              ()         => api.get('/api/cases/'),
  create:            (data)     => api.post('/api/cases/', data),
  detail:            (id)       => api.get(`/api/cases/${id}/`),
  update:            (id, data) => api.patch(`/api/cases/${id}/`, data),
  triageNote:        (id, note) => api.post(`/api/cases/${id}/triage-note/`, { note }),
  suggestFacilities: (id)       => api.get(`/api/cases/${id}/suggest-facilities/`),
}

// ── Referrals ─────────────────────────────────────────────────────────────────
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
export const consultationsApi = {
  list:         (params)   => api.get('/api/consultations/', { params }),
  create:       (data)     => api.post('/api/consultations/', data),
  queue:        ()         => api.get('/api/consultations/queue/'),
  detail:       (id)       => api.get(`/api/consultations/${id}/`),
  updateStatus: (id, data) => api.patch(`/api/consultations/${id}/status/`, data),
  delete:       (id)       => api.delete(`/api/consultations/${id}/`),
  specialists: {
    list:      (params)   => api.get('/api/consultations/specialists/', { params }),
    create:    (data)     => api.post('/api/consultations/specialists/', data),
    detail:    (id)       => api.get(`/api/consultations/specialists/${id}/`),
    update:    (id, data) => api.patch(`/api/consultations/specialists/${id}/`, data),
    available: ()         => api.get('/api/consultations/specialists/', { params: { is_available: true } }),
    schedules: (id)       => api.get(`/api/consultations/specialists/${id}/schedules/`),
  },
  messages: {
    list: (id)       => api.get(`/api/consultations/${id}/messages/`),
    send: (id, body) => api.post(`/api/consultations/${id}/messages/`, { body }),
  },
}

// ── Facilities ────────────────────────────────────────────────────────────────
export const facilitiesApi = {
  list:            (params)   => publicApi.get('/api/facilities/', { params }),
  create:          (data)     => api.post('/api/facilities/', data),
  detail:          (id)       => api.get(`/api/facilities/${id}/`),
  update:          (id, data) => api.patch(`/api/facilities/${id}/`, data),
  updateCapacity:  (id, data) => api.patch(`/api/facilities/${id}/capacity/`, data),
  capacityHistory: (id)       => api.get(`/api/facilities/${id}/capacity-history/`),
  delete:          (id)       => api.delete(`/api/facilities/${id}/`),
}

// ── Transport ─────────────────────────────────────────────────────────────────
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
    mine:         ()         => api.get('/api/transport/requests/'),
    detail:       (id)       => api.get(`/api/transport/requests/${id}/`),
    updateStatus: (id, data) => api.patch(`/api/transport/requests/${id}/status/`, data),
  },
}
