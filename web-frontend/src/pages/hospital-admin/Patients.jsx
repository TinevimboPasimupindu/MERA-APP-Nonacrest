import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { StatusBadge } from '../../components/Badge';
import EmptyState from '../../components/EmptyState';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'info_requested', label: 'Info Requested' },
];

export default function Patients() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounce the search box — wait for typing to pause before hitting the API.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        const qs = params.toString();
        const data = await apiCall(qs ? `${ENDPOINTS.patients}?${qs}` : ENDPOINTS.patients);
        if (!cancelled) setPatients(data || []);
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load patients.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [search, status]);

  const openPatient = (p) => {
    navigate(`/hospital-admin/patients/${p.patient_id}`, {
      state: { patientName: p.patient_name },
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Patients</h1>
        <p>Every patient tied to your hospital, across all verification statuses.</p>
      </div>

      <div style={{ margin: '20px 28px 0' }}>
        <input
          type="text"
          placeholder="Search by patient name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 360,
            background: 'var(--mera-bg)',
            border: '1px solid var(--mera-border)',
            borderRadius: 8,
            padding: '0.6rem 0.8rem',
            color: 'var(--mera-text)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div className="tab-bar">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`tab-btn ${status === f.value ? 'active' : ''}`}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">
          <div className="spinner" />
        </div>
      ) : error ? (
        <p className="field-error">{error}</p>
      ) : patients.length === 0 ? (
        <div className="card" style={{ margin: '20px 28px' }}>
          <EmptyState
            title="No patients found"
            message={
              search || status
                ? 'Try a different search term or filter.'
                : 'No patients are tied to your hospital yet.'
            }
          />
        </div>
      ) : (
        <div className="card table-wrap" style={{ margin: '20px 28px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.patient_id} onClick={() => openPatient(p)}>
                  <td>{p.patient_name}</td>
                  <td><StatusBadge status={p.verification_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
