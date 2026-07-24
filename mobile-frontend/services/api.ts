import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = 'https://mera-backend-b02t.onrender.com/api';

export const ENDPOINTS = {
  // Auth
  login: '/auth/login/',
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

  // Verification
  verification: '/verification/',

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
    console.log('Non-JSON response:', response.status, text.slice(0, 200));
    throw { status: response.status, detail: `Server error ${response.status}` };
  }

  if (!response.ok) {
    throw { status: response.status, ...data };
  }

  return data;
};