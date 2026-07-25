/**
 * src/api/client.js
 * Axios client for the NeoMatCare mobile app.
 * Endpoint-for-endpoint parity with neomatcare-frontend/src/api/client.js
 * and the Django backend URL configuration.
 */
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '../utils/secureStorage';

// ─── Base URL ──────────────────────────────────────────────────────────────────
// Must be set at build time via EXPO_PUBLIC_API_URL (see eas.json build profiles).
// Falls back to localhost for local dev only.
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
// eslint-disable-next-line no-console
console.log('[NeoMatCare] API BASE_URL resolved to:', BASE_URL);

// ─── Public client (no auth, no redirect/refresh handling) ───────────────────
export const publicApi = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // Render free tier cold starts can take 30-60s; give it room
});

// ─── Authenticated client ──────────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // Render free tier cold starts can take 30-60s; give it room
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.error('Error reading token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── 401 handling: single-flight refresh, queue concurrent requests ──────────
let _logoutCallback = null;
export const setLogoutCallback = (cb) => { _logoutCallback = cb; };

let isRefreshing = false;
let queue = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && original && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return apiClient(original);
        }).catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;
      const refresh = await getRefreshToken();

      if (!refresh) {
        isRefreshing = false;
        await clearTokens();
        await AsyncStorage.removeItem('user');
        if (_logoutCallback) _logoutCallback();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/api/auth/token/refresh/`, { refresh });
        await setTokens(data.access, data.refresh);

        queue.forEach(({ resolve }) => resolve(data.access));
        queue = [];

        original.headers.Authorization = `Bearer ${data.access}`;
        return apiClient(original);
      } catch (refreshError) {
        queue.forEach(({ reject }) => reject(refreshError));
        queue = [];
        await clearTokens();
        await AsyncStorage.removeItem('user');
        if (_logoutCallback) _logoutCallback();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Helper: extract a readable error message from any API error ─────────────
export const getErrorMessage = (error) => {
  if (error.response?.data?.detail) return error.response.data.detail;
  if (error.response?.data?.message) return error.response.data.message;
  if (error.response?.data) {
    const data = error.response.data;
    const firstKey = Object.keys(data)[0];
    if (firstKey) {
      const val = data[firstKey];
      const text = Array.isArray(val) ? val[0] : val;
      if (!['detail', 'message', 'non_field_errors'].includes(firstKey)) {
        return `${firstKey.replace(/_/g, ' ')}: ${text}`;
      }
      return String(text);
    }
  }
  if (error.code === 'ECONNABORTED') return 'The server is waking up (this can take up to a minute on first use) — please try again.';
  if (error.message === 'Network Error') return 'Cannot reach the server. Check your connection.';
  if (error.message) return error.message;
  return 'Something went wrong. Please try again.';
};

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register:       (data)    => publicApi.post('/api/auth/register/', data),
  verifyOtp:      (data)    => publicApi.post('/api/auth/verify-otp/', data),
  resendOtp:      (data)    => publicApi.post('/api/auth/resend-otp/', data),
  login:          (data)    => publicApi.post('/api/auth/login/', data),
  refresh:        (refresh) => publicApi.post('/api/auth/token/refresh/', { refresh }),
  logout:         (refresh) => apiClient.post('/api/auth/logout/', { refresh }),
  me:             ()        => apiClient.get('/api/auth/me/'),
  updateMe:       (data)    => apiClient.patch('/api/auth/me/', data),
  changePassword: (data)    => apiClient.post('/api/auth/change-password/', data),
  pushToken:      (token)   => apiClient.post('/api/auth/push-token/', { token }),
};

// ─── Users (admin user management — superadmin + facility_admin) ─────────────
export const usersApi = {
  list:   (params)   => apiClient.get('/api/auth/users/', { params }),
  create: (data)     => apiClient.post('/api/auth/users/', data),
  update: (id, data) => apiClient.patch(`/api/auth/users/${id}/`, data),
  delete: (id, params) => apiClient.delete(`/api/auth/users/${id}/`, { params }),
};

// ─── Specialist search (used when creating a consultation) ───────────────────
export const specialistSearchApi = {
  search: (q) => apiClient.get('/api/auth/specialists/search/', { params: { q } }),
};

// ─── Patient portal (role = patient) ──────────────────────────────────────────
export const patientPortalApi = {
  me: () => apiClient.get('/api/auth/patient/me/'),
  reviews: {
    list:   ()     => apiClient.get('/api/auth/patient/reviews/'),
    create: (data) => apiClient.post('/api/auth/patient/reviews/', data),
  },
};

// ─── Wellness (pregnancy tracker + cycle tracker) ─────────────────────────────
export const wellnessApi = {
  myPregnancy:      ()     => apiClient.get('/api/wellness/pregnancy/me/'),
  setEdd:           (data) => apiClient.post('/api/wellness/pregnancy/set-edd/', data),
  listCycleEntries: ()     => apiClient.get('/api/wellness/cycle/'),
  addCycleEntry:    (data) => apiClient.post('/api/wellness/cycle/', data),
  cyclePrediction:  ()     => apiClient.get('/api/wellness/cycle/prediction/'),
};

// ─── Notifications ─────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:        ()   => apiClient.get('/api/notifications/'),
  unreadCount: ()   => apiClient.get('/api/notifications/unread-count/'),
  markRead:    (id) => apiClient.post(`/api/notifications/${id}/read/`),
  markAllRead: ()   => apiClient.post('/api/notifications/mark-all-read/'),
};

// ─── Patients (persistent patient records — health_worker/facility_admin/superadmin) ─
export const patientsApi = {
  list:        (params)   => apiClient.get('/api/cases/patients/', { params }),
  create:      (data)     => apiClient.post('/api/cases/patients/', data),
  detail:      (id)       => apiClient.get(`/api/cases/patients/${id}/`),
  update:      (id, data) => apiClient.patch(`/api/cases/patients/${id}/`, data),
  delete:      (id)       => apiClient.delete(`/api/cases/patients/${id}/`),
  cases:       (id)       => apiClient.get(`/api/cases/patients/${id}/cases/`),
  computeRisk: (id)       => apiClient.post(`/api/cases/patients/${id}/compute-risk/`),
  ancVisits: {
    list:   (patientId)                => apiClient.get(`/api/cases/patients/${patientId}/anc-visits/`),
    create: (patientId, data)          => apiClient.post(`/api/cases/patients/${patientId}/anc-visits/`, data),
    update: (patientId, visitId, data) => apiClient.patch(`/api/cases/patients/${patientId}/anc-visits/${visitId}/`, data),
    delete: (patientId, visitId)       => apiClient.delete(`/api/cases/patients/${patientId}/anc-visits/${visitId}/`),
  },
  consent: {
    list:   (patientId)       => apiClient.get(`/api/cases/patients/${patientId}/consent/`),
    record: (patientId, data) => apiClient.post(`/api/cases/patients/${patientId}/consent/`, data),
  },
  portal: {
    grant:  (patientId, data) => apiClient.post(`/api/cases/patients/${patientId}/grant-portal/`, data),
    revoke: (patientId)       => apiClient.post(`/api/cases/patients/${patientId}/revoke-portal/`),
  },
};

// ─── Cases (EmergencyCase) ─────────────────────────────────────────────────────
export const casesApi = {
  list:              ()         => apiClient.get('/api/cases/'),
  create:            (data)     => apiClient.post('/api/cases/', data),
  detail:            (id)       => apiClient.get(`/api/cases/${id}/`),
  update:            (id, data) => apiClient.patch(`/api/cases/${id}/`, data),
  triageNote:        (id, note) => apiClient.post(`/api/cases/${id}/triage-note/`, { note }),
  suggestFacilities: (id)       => apiClient.get(`/api/cases/${id}/suggest-facilities/`),
};

// ─── Referrals ─────────────────────────────────────────────────────────────────
export const referralsApi = {
  suggest:      (emergencyCaseId)       => apiClient.post('/api/referrals/suggest/', { emergency_case_id: emergencyCaseId }),
  create:       (data)                  => apiClient.post('/api/referrals/create/', data),
  list:         (params)                => apiClient.get('/api/referrals/', { params }),
  detail:       (id)                    => apiClient.get(`/api/referrals/${id}/`),
  updateStatus: (id, status, note = '') => apiClient.patch(`/api/referrals/${id}/status/`, { status, note }),
  timeline:     (id)                    => apiClient.get(`/api/referrals/${id}/timeline/`),
  outcome:      (id, data)              => apiClient.patch(`/api/referrals/${id}/outcome/`, data),
};

// ─── Consultations ─────────────────────────────────────────────────────────────
export const consultationsApi = {
  list:         (params)   => apiClient.get('/api/consultations/', { params }),
  create:       (data)     => apiClient.post('/api/consultations/', data),
  queue:        ()         => apiClient.get('/api/consultations/queue/'),
  detail:       (id)       => apiClient.get(`/api/consultations/${id}/`),
  updateStatus: (id, data) => apiClient.patch(`/api/consultations/${id}/status/`, data),
  delete:       (id)       => apiClient.delete(`/api/consultations/${id}/`),
  specialists: {
    list:      (params)   => apiClient.get('/api/consultations/specialists/', { params }),
    create:    (data)     => apiClient.post('/api/consultations/specialists/', data),
    detail:    (id)       => apiClient.get(`/api/consultations/specialists/${id}/`),
    update:    (id, data) => apiClient.patch(`/api/consultations/specialists/${id}/`, data),
    available: ()         => apiClient.get('/api/consultations/specialists/', { params: { is_available: true } }),
    schedules: (id)       => apiClient.get(`/api/consultations/specialists/${id}/schedules/`),
  },
  messages: {
    list: (id)       => apiClient.get(`/api/consultations/${id}/messages/`),
    send: (id, body) => apiClient.post(`/api/consultations/${id}/messages/`, { body }),
  },
  callSignals: {
    list: (id, since) => apiClient.get(`/api/consultations/${id}/call-signals/`, { params: since ? { since } : {} }),
    send: (id, data)  => apiClient.post(`/api/consultations/${id}/call-signals/`, data),
    end:  (id)        => apiClient.post(`/api/consultations/${id}/call-end/`),
  },
  iceServers: () => apiClient.get('/api/consultations/ice-servers/'),
};

// ─── Facilities ────────────────────────────────────────────────────────────────
export const facilitiesApi = {
  list:            (params)   => publicApi.get('/api/facilities/', { params }),
  create:          (data)     => apiClient.post('/api/facilities/', data),
  detail:          (id)       => apiClient.get(`/api/facilities/${id}/`),
  update:          (id, data) => apiClient.patch(`/api/facilities/${id}/`, data),
  updateCapacity:  (id, data) => apiClient.patch(`/api/facilities/${id}/capacity/`, data),
  capacityHistory: (id)       => apiClient.get(`/api/facilities/${id}/capacity-history/`),
  delete:          (id)       => apiClient.delete(`/api/facilities/${id}/`),
};

// ─── Transport ─────────────────────────────────────────────────────────────────
export const transportApi = {
  vehicles: {
    list:      (params)   => apiClient.get('/api/transport/vehicles/', { params }),
    create:    (data)     => apiClient.post('/api/transport/vehicles/', data),
    detail:    (id)       => apiClient.get(`/api/transport/vehicles/${id}/`),
    update:    (id, data) => apiClient.patch(`/api/transport/vehicles/${id}/`, data),
    delete:    (id)       => apiClient.delete(`/api/transport/vehicles/${id}/`),
    available: (params)   => apiClient.get('/api/transport/vehicles/available/', { params }),
  },
  drivers: {
    list:   (params)   => apiClient.get('/api/transport/drivers/', { params }),
    create: (data)     => apiClient.post('/api/transport/drivers/', data),
    update: (id, data) => apiClient.patch(`/api/transport/drivers/${id}/`, data),
    detail: (id)       => apiClient.get(`/api/transport/drivers/${id}/`),
  },
  requests: {
    list:         (params)   => apiClient.get('/api/transport/requests/', { params }),
    create:       (data)     => apiClient.post('/api/transport/requests/', data),
    mine:         ()         => apiClient.get('/api/transport/requests/'),
    detail:       (id)       => apiClient.get(`/api/transport/requests/${id}/`),
    updateStatus: (id, data) => apiClient.patch(`/api/transport/requests/${id}/status/`, data),
  },
};

// ─── AI (triage extraction, risk narration, ANC anomaly, handover briefs, transport recs, chat) ─
export const aiApi = {
  triageExtract:       (note, caseId = null) => apiClient.post('/api/ai/triage-extract/', { note, case_id: caseId }),
  riskNarrate:         (patientId)           => apiClient.post('/api/ai/risk-narrate/', { patient_id: patientId }),
  ancAnomaly:          (patientId)           => apiClient.post('/api/ai/anc-anomaly/', { patient_id: patientId }),
  referralHandover:    (params)              => apiClient.post('/api/ai/referral-handover/', params), // { referral_id } or { case_id }
  transportRecommend:  (caseId, estimatedTravelMinutes, vehicles) =>
    apiClient.post('/api/ai/transport-recommend/', { case_id: caseId, estimated_travel_minutes: estimatedTravelMinutes, vehicles }),
  chat:                (messages, context = {}) => apiClient.post('/api/ai/chat/', { messages, context }),
};

export default apiClient;
