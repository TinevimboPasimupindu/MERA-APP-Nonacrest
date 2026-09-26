const BASE_URL = 'https://mera-app-nonacrest.onrender.com/api';
// For local backend testing, swap to: 'http://localhost:8000/api' FOR DEPLOYED WEB USE: 'https://mera-app-nonacrest.onrender.com/api'

export const ENDPOINTS = {
  login: '/auth/login/',
  me: '/auth/me/',
  refresh: '/auth/token/refresh/',
  passwordResetRequest: '/auth/password-reset/',
  passwordResetConfirm: '/auth/password-reset/confirm/',

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
  institutionDocuments: (id) => `/auth/admin/institutions/${id}/documents/`,
  users: '/auth/admin/users/',
  stats: '/auth/admin/stats/',
  editUser: (id) => `/auth/admin/users/${id}/`,
  deactivateUser: (id) => `/auth/admin/users/${id}/deactivate/`,
  reactivateUser: (id) => `/auth/admin/users/${id}/reactivate/`,
  triggerPasswordReset: (id) => `/auth/admin/users/${id}/trigger-password-reset/`,
  createHospitalAdmin: '/auth/admin/create/hospital-admin/',
  createAmbulanceAdmin: '/auth/admin/create/ambulance-admin/',

  // MERA super-admin — NFC emergency tags
  nfcTagsGenerate: '/nfc-tags/generate/',
  nfcTags: '/nfc-tags/',
  nfcTagsPair: '/nfc-tags/pair/',
  nfcTagUnpair: (id) => `/nfc-tags/${id}/unpair/`,
  nfcTagVoid: (id) => `/nfc-tags/${id}/void/`,

  // Public, unauthenticated bystander flow (no auth token sent — see
  // apiCall's requiresAuth param)
  nfcTagStatus: (token) => `/nfc/${token}/`,
  nfcTagTrigger: (token) => `/nfc/${token}/trigger/`,
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
  // FormData (file uploads — see Institutions.jsx's document upload fields)
  // must NOT be JSON.stringify'd, and must NOT get an explicit Content-Type
  // header: the browser sets `multipart/form-data; boundary=...` itself when
  // it sees the fetch body is a FormData instance, and that boundary value
  // is only known to the browser — setting Content-Type manually here would
  // produce a header with no boundary, which the server can't parse. Every
  // other caller passes a plain object and is unaffected by this branch.
  const isFormData = body instanceof FormData;
  const headers = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (requiresAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    // fetch only rejects when no response arrived at all.
    throw { status: 0, detail: NETWORK_ERROR };
  }

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

  // Empty body (e.g. DRF destroy() → 204 No Content) is a valid response,
  // not a parse failure — JSON.parse('') would throw and look like an error.
  if (!text) {
    if (!response.ok) throw { status: response.status, detail: statusMessage(response.status) };
    return null;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw { status: response.status, detail: statusMessage(response.status) };
  }

  if (!response.ok) {
    throw normalizeError(response.status, data);
  }

  return data;
};

// Every error apiCall throws carries a specific, human-readable `detail`, so
// a page's `err.detail || '...'` shows what actually went wrong (no
// connection, server fault, which field was rejected) instead of a generic
// fallback. Field errors stay on the object for pages that label a field.

const NETWORK_ERROR = "Can't reach the MERA server. Check your internet connection and try again.";

function statusMessage(status) {
  if (status >= 500) {
    return `The MERA server had a problem (error ${status}). Wait a minute and try again — if it keeps happening, contact MERA support.`;
  }
  if (status === 404) return "That item couldn't be found — it may have been removed.";
  if (status === 403) return "Your account isn't allowed to do that.";
  if (status === 401) return 'Your session has expired. Please log in again.';
  return `The request couldn't be completed (error ${status}).`;
}

const humanize = (field) => field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');

function firstMessage(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstMessage(value[0]);
  if (value && typeof value === 'object') return firstMessage(Object.values(value)[0]);
  return null;
}

function normalizeError(status, data) {
  const err = { status, ...(data && typeof data === 'object' ? data : {}) };
  if (!err.detail) {
    const field = Object.keys(err).find((k) => k !== 'status' && firstMessage(err[k]));
    if (field) {
      const msg = firstMessage(err[field]);
      err.detail = field === 'non_field_errors' ? msg : `${humanize(field)}: ${msg}`;
    } else {
      err.detail = statusMessage(status);
    }
  }
  return err;
}