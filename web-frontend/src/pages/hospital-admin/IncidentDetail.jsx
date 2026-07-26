import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { StatusBadge } from '../../components/Badge';
import { useToast } from '../../components/Toast';

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();

  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingReady, setMarkingReady] = useState(false);
  const [markedReady, setMarkedReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await apiCall(ENDPOINTS.incidentDetail(id));
        if (!cancelled) setIncident(data);
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load this incident.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleMarkReady = async () => {
    setMarkingReady(true);
    try {
      await apiCall(ENDPOINTS.markIncidentReady(id), 'POST');
      setMarkedReady(true);
      showToast('Marked ready to receive this patient.');
    } catch (err) {
      showToast(err.detail || 'Could not mark this incident ready.', { type: 'error' });
    } finally {
      setMarkingReady(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !incident) {
    return <p className="field-error">{error || 'Incident not found.'}</p>;
  }

  const note = incident.treatment_note;

  return (
    <div>
      <div className="page-header spread">
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/hospital-admin/incoming')} style={{ marginBottom: 8, padding: '4px 0' }}>
            ← Back to incoming ambulances
          </button>
          <h1>{incident.patient_summary?.full_name || 'Unknown patient'}</h1>
          <p>
            {incident.ambulance_name ? `${incident.ambulance_name} · ` : ''}
            ETA {incident.eta_minutes != null ? `${incident.eta_minutes} min` : 'unknown'}
          </p>
        </div>
        <StatusBadge status={incident.status} />
      </div>

      <div className="card section-card">
        <div className="section-card-header">
          <h2>Patient summary</h2>
        </div>
        <div className="profile-grid">
          <ProfileField label="Blood type" value={incident.patient_summary?.blood_type} />
          <ProfileField label="Known allergies" value={incident.patient_summary?.known_allergies} />
          <ProfileField label="Chronic conditions" value={incident.patient_summary?.chronic_conditions} full />
        </div>
      </div>

      <div className="card section-card">
        <div className="section-card-header">
          <h2>Treatment notes from EMT</h2>
        </div>
        {!note ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No treatment notes submitted yet.</p>
        ) : (
          <>
            <div className="profile-grid">
              <ProfileField label="Chief complaint" value={note.chief_complaint} />
              <ProfileField label="Treatment administered" value={note.treatment_administered} />
              <ProfileField label="Blood pressure" value={note.blood_pressure} />
              <ProfileField label="SpO2" value={note.spo2} />
              <ProfileField label="Heart rate" value={note.heart_rate} />
              <ProfileField label="Medications given" value={note.medications_given} />
            </div>
            <ProfileField label="Additional notes" value={note.additional_notes} full />
            {note.is_draft && (
              <p style={{ fontSize: 13, color: 'var(--approaching)', marginTop: 8 }}>
                These notes are still a draft and may change before arrival.
              </p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleMarkReady}
        disabled={markingReady || markedReady}
      >
        {markedReady ? 'Marked ready ✓' : markingReady ? 'Marking ready…' : 'Mark ready to receive'}
      </button>
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
