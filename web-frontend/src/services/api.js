const BASE_URL = 'http://localhost:8000/api';
// For local backend testing, swap to: 'http://localhost:8000/api' FOR DEPLOYED WEB USE: 'https://mera-app-nonacrest.onrender.com'

export const ENDPOINTS = {
  login: '/auth/login/',
  me: '/auth/me/',
  refresh: '/auth/token/refresh/',

  // Hospital admin — verification queue
  verificationQueue: '/verification/queue/',
  verificationApproved: '/verification/approved/',
  verificationFlagged: '/verification/flagged/',
  verificationReview: (id) => `/verification/${id}/review/`,
  verificationAction: (id) => `/verification/${id}/action/`,

  // Hospital admin — patient medical profile
  patients: '/medical-profile/patients/',
  patientProfile: (patientId) => `/medical-profile/${patientId}/hospital_view/`,
  patientProfileEdit: (patientId) => `/medical-profile/${patientId}/hospital_edit/`,

  // Hospital admin — incoming ambulance notifications
  incomingPatients: '/incidents/incoming_patients/',
  incidentDetail: (id) => `/incidents/${id}/hospital_detail/`,
  markIncidentReady: (id) => `/incidents/${id}/mark_ready/`,

  // Ambulance admin
  createEmt: '/auth/admin/create/emt/',
  myEmts: '/auth/admin/my-emts/',
  emtUpdate: (id) => `/auth/admin/emts/${id}/`,
  myResponses: '/incidents/my_responses/',

  // MERA super-admin
  institutions: '/auth/admin/institutions/',
  users: '/auth/admin/users/',
  stats: '/auth/admin/stats/',
  editUser: (id) => `/auth/admin/users/${id}/`,
  deactivateUser: (id) => `/auth/admin/users/${id}/deactivate/`,
  reactivateUser: (id) => `/auth/admin/users/${id}/reactivate/`,
  createHospitalAdmin: '/auth/admin/create/hospital-admin/',
  createAmbulanceAdmin: '/auth/admin/create/ambulance-admin/',
};

export const saveToken = (access, refresh) => {
  if (access) localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
};

export const getToken = () => {
  return localStorage.getItem('access_token');
};

export const getRefreshToken = () => {
  return localStorage.getItem('refresh_token');
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

// Single in-flight refresh so multiple 401s at once don't each fire their
// own refresh request — they all await the same promise.
let refreshInFlight = null;

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) throw { status: 401, detail: 'Not authenticated.' };

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}${ENDPOINTS.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
      .then(async (res) => {
        if (!res.ok) throw { status: res.status, detail: 'Session expired.' };
        const data = await res.json();
        saveToken(data.access, null);
        return data.access;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export const apiCall = async (endpoint, method = 'GET', body = null, requiresAuth = true, _retry = true) => {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (requiresAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && requiresAuth && _retry && getRefreshToken()) {
    try {
      await refreshAccessToken();
      return apiCall(endpoint, method, body, requiresAuth, false);
    } catch {
      clearTokens();
      throw { status: 401, detail: 'Your session has expired. Please log in again.' };
    }
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw { status: response.status, detail: `Server error ${response.status}` };
  }

  if (!response.ok) {
    throw { status: response.status, ...data };
  }

  return data;
};