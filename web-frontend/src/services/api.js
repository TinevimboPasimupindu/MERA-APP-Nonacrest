// Base URL — point at the deployed Render backend by default.
// For local backend testing, swap to: 'http://localhost:8000/api'
const BASE_URL = 'https://mera-backend-b02t.onrender.com/api';

// ---- Endpoint map ---------------------------------------------------
// Static endpoints are plain strings. Endpoints that need an id are
// functions so callers do ENDPOINTS.verificationReview(id).
export const ENDPOINTS = {
  // auth
  login: '/auth/login/',
  me: '/auth/me/',
  refresh: '/auth/token/refresh/',

  // verification queue (hospital admin)
  verificationQueue: '/verification/queue/',
  verificationApproved: '/verification/approved/',
  verificationFlagged: '/verification/flagged/',
  verificationReview: (id) => `/verification/${id}/review/`,
  verificationAction: (id) => `/verification/${id}/action/`,

  // medical profiles (hospital admin — takes the patient id)
  patientProfile: (patientId) => `/medical-profile/${patientId}/hospital_view/`,
  patientProfileEdit: (patientId) => `/medical-profile/${patientId}/hospital_edit/`,

  // incoming ambulance notifications (hospital admin)
  incomingPatients: '/incidents/incoming_patients/',
  incidentDetail: (id) => `/incidents/${id}/hospital_detail/`,
  markIncidentReady: (id) => `/incidents/${id}/mark_ready/`,
};

// ---- Token storage ----------------------------------------------------

const ACCESS_KEY = 'mera_access';
const REFRESH_KEY = 'mera_refresh';

export const getToken = () => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

export const saveToken = (access, refresh) => {
  if (access) localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
};

export const clearToken = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

// ---- Core request function --------------------------------------------
// apiCall(endpoint, method, body, requiresAuth) — matches Login.jsx usage:
//   apiCall(ENDPOINTS.login, 'POST', { email, password }, false)
//
// Handles JSON encoding/decoding and a single silent retry on 401 using
// the refresh token (accounts/urls.py: /auth/token/refresh/).

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

export async function apiCall(endpoint, method = 'GET', body = null, requiresAuth = true, _retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (requiresAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && requiresAuth && _retry && getRefreshToken()) {
    try {
      await refreshAccessToken();
      return apiCall(endpoint, method, body, requiresAuth, false);
    } catch {
      clearToken();
      throw { status: 401, detail: 'Your session has expired. Please log in again.' };
    }
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw { status: res.status, detail: `Unexpected server response (${res.status}).` };
    }
  }

  if (!res.ok) {
    throw { status: res.status, ...(data || {}) };
  }
  return data;
}
