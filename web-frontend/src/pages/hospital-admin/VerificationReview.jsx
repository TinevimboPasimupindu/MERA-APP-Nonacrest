import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { StatusBadge } from '../../components/Badge';
import VerificationActionModal from '../../components/VerificationActionModal';
import { useToast } from '../../components/Toast';

export default function VerificationReview() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeAction, setActiveAction] = useState(null); // 'approve' | 'flag' | 'request_info' | null
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await apiCall(ENDPOINTS.verificationReview(id));
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load this patient profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleConfirmAction = async (note) => {
    setSubmitting(true);
    try {
      await apiCall(ENDPOINTS.verificationAction(id), 'POST', { action: activeAction, note });
      showToast(
        activeAction === 'approve'
          ? 'Profile approved.'
          : activeAction === 'flag'
          ? 'Profile flagged for an in-person visit.'
          : 'Request for more information sent to the patient.'
      );
      navigate('/hospital-admin/verification-queue');
    } catch (err) {
      showToast(err.detail || 'That action could not be completed.', { type: 'error' });
    } finally {
      setSubmitting(false);
      setActiveAction(null);
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !profile) {
    return <p className="field-error">{error || 'Profile not found.'}</p>;
  }

  const patientName = state?.patientName || 'Patient';

  return (
    <div>
      <div className="page-header spread">
        <div>
          <h1>{patientName}</h1>
          <p>Submitted medical profile — review before approving.</p>
        </div>
        <StatusBadge status={profile.verification_status} />
      </div>

      <div className="card section-card">
        <div className="section-card-header">
          <h2>Medical details</h2>
        </div>
        <div className="profile-grid">
          <ProfileField label="Blood type" value={profile.blood_type} />
          <ProfileField label="Known allergies" value={profile.known_allergies} />
          <ProfileField label="Chronic conditions" value={profile.chronic_conditions} />
          <ProfileField label="Current medications" value={profile.current_medications} />
        </div>
        <ProfileField label="Paramedic notes" value={profile.paramedic_notes} full />
      </div>

      <div className="card section-card">
        <div className="section-card-header">
          <h2>Consent</h2>
        </div>
        <div className="profile-grid">
          <ProfileField
            label="Data sharing with hospital/ambulance"
            value={profile.data_sharing_consent ? 'Granted' : 'Not granted'}
          />
          <ProfileField
            label="AI chatbot use of profile"
            value={profile.ai_chatbot_consent ? 'Granted' : 'Not granted'}
          />
        </div>
      </div>

      <div className="row gap-sm">
        <button type="button" className="btn btn-primary" onClick={() => setActiveAction('approve')}>
          Approve
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveAction('request_info')}>
          Request more info
        </button>
        <button type="button" className="btn btn-danger" onClick={() => setActiveAction('flag')}>
          Flag for in-person visit
        </button>
      </div>

      {activeAction && (
        <VerificationActionModal
          action={activeAction}
          submitting={submitting}
          onCancel={() => setActiveAction(null)}
          onConfirm={handleConfirmAction}
        />
      )}
    </div>
  );
}

function ProfileField({ label, value, full = false }) {
  return (
    <div className="profile-field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div className="profile-field-label">{label}</div>
      <div className="profile-field-value">{value || '—'}</div>
    </div>
  );
}
