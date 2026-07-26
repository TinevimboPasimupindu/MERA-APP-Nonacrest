import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { StatusBadge } from '../../components/Badge';
import { useToast } from '../../components/Toast';

const EDITABLE_FIELDS = [
  { key: 'blood_type', label: 'Blood type', type: 'input', placeholder: 'e.g. O+' },
  { key: 'known_allergies', label: 'Known allergies', type: 'textarea' },
  { key: 'chronic_conditions', label: 'Chronic conditions', type: 'textarea' },
  { key: 'current_medications', label: 'Current medications', type: 'textarea' },
  { key: 'paramedic_notes', label: 'Paramedic notes', type: 'textarea' },
];

export default function UpdatePatientRecords() {
  const { patientId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await apiCall(ENDPOINTS.patientProfile(patientId));
        if (!cancelled) {
          setProfile(data);
          setForm({
            blood_type: data.blood_type || '',
            known_allergies: data.known_allergies || '',
            chronic_conditions: data.chronic_conditions || '',
            current_medications: data.current_medications || '',
            paramedic_notes: data.paramedic_notes || '',
          });
        }
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load this patient record.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isDirty = profile && form && EDITABLE_FIELDS.some((f) => (profile[f.key] || '') !== form[f.key]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await apiCall(ENDPOINTS.patientProfileEdit(patientId), 'PATCH', form);
      setProfile(updated);
      setForm({
        blood_type: updated.blood_type || '',
        known_allergies: updated.known_allergies || '',
        chronic_conditions: updated.chronic_conditions || '',
        current_medications: updated.current_medications || '',
        paramedic_notes: updated.paramedic_notes || '',
      });
      showToast('Patient record updated.');
    } catch (err) {
      showToast(err.detail || 'Could not save changes.', { type: 'error' });
    } finally {
      setSaving(false);
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
    return <p className="field-error">{error || 'Record not found.'}</p>;
  }

  const patientName = state?.patientName || 'Patient';

  return (
    <div>
      <div className="page-header spread">
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/hospital-admin/verification-queue')}
            style={{ marginBottom: 8, padding: '4px 0' }}
          >
            ← Back to verification queue
          </button>
          <h1>{patientName}</h1>
          <p>
            {profile.verified_at
              ? `Verified ${new Date(profile.verified_at).toLocaleDateString()}`
              : 'Update this patient\u2019s medical record.'}
          </p>
        </div>
        <StatusBadge status={profile.verification_status} />
      </div>

      <div className="card section-card">
        <div className="section-card-header">
          <h2>Medical record</h2>
        </div>
        <div className="stack gap-md">
          {EDITABLE_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={f.key}>{f.label}</label>
              {f.type === 'input' ? (
                <input
                  id={f.key}
                  value={form[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                />
              ) : (
                <textarea
                  id={f.key}
                  rows={3}
                  value={form[f.key]}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="row gap-sm">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {profile.last_updated_at && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Last updated {new Date(profile.last_updated_at).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
