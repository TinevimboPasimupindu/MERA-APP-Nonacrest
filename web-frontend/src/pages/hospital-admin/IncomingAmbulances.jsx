import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { StatusBadge } from '../../components/Badge';
import EmptyState from '../../components/EmptyState';

export default function IncomingAmbulances() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await apiCall(ENDPOINTS.incomingPatients);
        if (!cancelled) setItems(data || []);
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load incoming ambulances.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Incoming ambulances</h1>
        <p>Patients currently en route to your hospital, sorted by ETA.</p>
      </div>

      {loading ? (
        <div className="page-loading">
          <div className="spinner" />
        </div>
      ) : error ? (
        <p className="field-error">{error}</p>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No ambulances inbound"
            message="You'll see a patient here as soon as an ambulance is dispatched to your hospital."
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Status</th>
                <th>ETA</th>
                <th>Ambulance</th>
                <th>Known allergies</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => navigate(`/hospital-admin/incoming/${item.id}`)}>
                  <td>{item.patient_summary?.full_name || 'Unknown patient'}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className="mono">{item.eta_minutes != null ? `${item.eta_minutes} min` : '—'}</td>
                  <td>{item.ambulance_name || '—'}</td>
                  <td>{item.patient_summary?.known_allergies || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
