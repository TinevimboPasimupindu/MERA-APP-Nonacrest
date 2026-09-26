import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = 'https://mera-app-nonacrest.onrender.com/api';
// For local backend testing, swap to: 'http://172.16.39.142:8000/api' FOR DEPLOYED WEB USE: 'https://mera-app-nonacrest.onrender.com/api'

export const ENDPOINTS = {
  // Auth
  login: '/auth/login/',
  verifyOtp: '/auth/verify-otp/',
  resendOtp: '/auth/resend-otp/',
  googleSignIn: '/auth/google/',
  registerPatient: '/auth/register/patient/',
  registerHospital: '/auth/register/hospital/',
  registerAmbulance: '/auth/register/ambulance/',
  me: '/auth/me/',
  passwordReset: '/auth/password-reset/',
  passwordResetConfirm: '/auth/password-reset/confirm/',

  // Medical Profile
  medicalProfileSubmit: '/medical-profile/submit/',
  medicalProfileMe: '/medical-profile/me/',
  medicalProfileAiChatbotConsent: '/medical-profile/ai_chatbot_consent_toggle/',

  // Emergency Contacts
  emergencyContacts: '/emergency-contacts/',

  // Emergencies
  triggerSOS: '/incidents/trigger_sos/',
  confirmSOS: (id: string) => `/incidents/${id}/confirm/`,
  cancelIncident: (id: string) => `/incidents/${id}/cancel/`,
  getIncident: (id: string) => `/incidents/${id}/`,
  updateStatus: (id: string) => `/incidents/${id}/update_status/`,
  myActiveIncident: '/incidents/my_active/',

  // Verification
  verification: '/verification/',
  verificationMyStatus: '/verification/my_status/',

  // Facilities
  facilities: '/facilities/',

  // Chatbot
  // Chatbot
  chatbotMessage: '/chatbot/message/',
  chatbotHistory: '/chatbot/history/',
};

export const saveToken = async (access: string, refresh: string) => {
  await AsyncStorage.setItem('access_token', access);
  await AsyncStorage.setItem('refresh_token', refresh);
};

export const getToken = async () => {
  return await AsyncStorage.getItem('access_token');
};

export const clearTokens = async () => {
  await AsyncStorage.removeItem('access_token');
  await AsyncStorage.removeItem('refresh_token');
};

export const apiCall = async (
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: object,
  requiresAuth: boolean = false
) => {
  const headers: any = {
    'Content-Type': 'application/json',
  };

  if (requiresAuth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only rejects when no response arrived at all.
    throw { status: 0, detail: NETWORK_ERROR };
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
    console.log('Non-JSON response:', response.status, text.slice(0, 200));
    throw { status: response.status, detail: statusMessage(response.status) };
  }

  if (!response.ok) {
    throw normalizeError(response.status, data, requiresAuth);
  }

  return data;
};

// ─── Error messages ──────────────────────────────────────────────────────────
// Every error apiCall throws carries a specific, human-readable `detail`, so
// a screen's `err.detail || '...'` shows what actually went wrong (no
// connection, server fault, expired session, which field was rejected)
// instead of falling through to a generic "please try again". Field errors
// are kept on the object too, for screens that highlight a specific field.

const NETWORK_ERROR =
  "Can't reach MERA. Check your internet connection and try again. In an emergency, call 10177.";

function statusMessage(status: number): string {
  if (status >= 500) {
    return `MERA's server had a problem (error ${status}). Wait a minute and try again — if it keeps happening, contact MERA support.`;
  }
  if (status === 404) return "That item couldn't be found — it may have been removed.";
  if (status === 403) return "Your account isn't allowed to do that.";
  if (status === 401) return 'Your session has expired. Please log in again.';
  return `The request couldn't be completed (error ${status}).`;
}

const humanize = (field: string) =>
  field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');

function firstMessage(value: any): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstMessage(value[0]);
  if (value && typeof value === 'object') return firstMessage(Object.values(value)[0]);
  return null;
}

function normalizeError(status: number, data: any, requiresAuth: boolean) {
  const err = { status, ...(data && typeof data === 'object' ? data : {}) };
  // simplejwt's own wording ("Given token not valid for any token type").
  if (status === 401 && requiresAuth && (err.code === 'token_not_valid' || !err.detail)) {
    err.detail = statusMessage(401);
  }
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