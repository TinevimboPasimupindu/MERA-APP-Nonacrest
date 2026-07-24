const BASE_URL = 'http://localhost:8000/api';
// For local backend testing, swap to: 'http://localhost:8000/api' FOR DEPLOYED WEB USE: 'https://mera-backend-b02t.onrender.com/api'

export const ENDPOINTS = {
  login: '/auth/login/',
  me: '/auth/me/',

  // Hospital admin
  verificationQueue: '/verification/',

  // Ambulance admin
  emts: '/accounts/emts/',

  // MERA super-admin
  institutions: '/admin/institutions/',
  users: '/admin/users/',
  stats: '/admin/stats/',
};

export const saveToken = (access, refresh) => {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
};

export const getToken = () => {
  return localStorage.getItem('access_token');
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

export const apiCall = async (endpoint, method = 'GET', body = null, requiresAuth = true) => {
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