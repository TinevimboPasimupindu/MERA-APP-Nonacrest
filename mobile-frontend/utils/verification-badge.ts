import { Colors } from '../constants/theme';

// Shared by medical-profile.tsx and settings.tsx so both screens always
// show the same verification badge for the same patient.
//
// The patient's latest verification request (/verification/my_status/) is
// the status their hospital sees, so the badge follows it; with no request
// yet, fall back to the profile's own status (/medical-profile/me/).
export const getVerificationBadge = (request: any, profile: any) => {
  switch (request?.status) {
    case 'approved':
      return { label: '✓  Verified', color: Colors.success, bg: '#0A2010' };
    case 'flagged':
      return { label: '⚠️  Visit required', color: '#FF6B6B', bg: '#2A0A0A' };
    case 'info_requested':
      return { label: 'ℹ️  More info requested', color: Colors.warning, bg: '#2A1F05' };
    case 'pending':
    case 'in_progress':
      return { label: '⏳  Pending review', color: Colors.warning, bg: '#2A1F05' };
  }
  return profile?.verification_status === 'unsubmitted'
    ? { label: 'Not submitted', color: Colors.textSecondary, bg: '#1A1B2E' }
    : { label: 'Not sent to a hospital', color: Colors.textSecondary, bg: '#1A1B2E' };
};
