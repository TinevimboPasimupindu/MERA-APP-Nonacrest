import { router } from 'expo-router';
import { apiCall, ENDPOINTS } from '../services/api';

// Decides where an authenticated user should land: back into an
// in-progress emergency they were already part of (patient with an active
// SOS, EMT/ambulance with an assigned response) if one exists, or their
// normal role dashboard otherwise. Shared by the app-launch session-restore
// check ((auth)/index.tsx) and manual login (login.tsx) so both paths make
// the same decision the same way — a patient who reloads the app
// mid-emergency and a patient who gets logged out and logs back in
// mid-emergency should both land back on emergency-active.tsx, not just
// whichever path happens to check for it.
export async function routeAfterAuth(role: string) {
  if (role === 'patient') {
    const active = await getActiveIncident();
    if (active) {
      router.replace({
        pathname: '/(patient)/emergency-active' as any,
        params: { incidentId: active.id },
      });
      return;
    }
    router.replace('/(patient)/patient-dashboard' as any);
    return;
  }

  if (role === 'emt' || role === 'ambulance_service' || role === 'ambulance_admin') {
    const active = await getActiveIncident();
    if (active) {
      router.replace({
        pathname: '/(ambulance)/active-response' as any,
        params: { incidentId: active.id },
      });
      return;
    }
    router.replace('/(ambulance)/dashboard' as any);
    return;
  }

  if (role === 'hospital') {
    router.replace('/(hospital)/HospitalPortal' as any);
    return;
  }

  // No mobile destination for other roles (mera_admin, hospital_admin) —
  // matches login.tsx's pre-existing role table, which doesn't cover them
  // either; mobile is patient/EMT-only per PROJECT_CONTEXT.md. Caller is
  // responsible for falling back to something sensible if this returns
  // without navigating.
}

async function getActiveIncident(): Promise<{ id: string } | null> {
  try {
    const data = await apiCall(ENDPOINTS.myActiveIncident, 'GET', undefined, true);
    return data?.active_incident ?? null;
  } catch (err) {
    // If this check fails (network hiccup, etc.), degrade to the normal
    // dashboard rather than blocking navigation entirely — losing the
    // auto-restore for one launch is far better than getting stuck.
    console.log('my_active check failed:', err);
    return null;
  }
}
