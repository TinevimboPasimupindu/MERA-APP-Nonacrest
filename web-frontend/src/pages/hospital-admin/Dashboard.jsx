import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { UrgencyBadge } from '../../components/Badge';
import EmptyState from '../../components/EmptyState';

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [incoming, setIncoming] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [queueData, flaggedData, incomingData] = await Promise.all([
          apiCall(ENDPOINTS.verificationQueue),
          apiCall(ENDPOINTS.verificationFlagged),
          apiCall(ENDPOINTS.incomingPatients),
        ]);
        if (!cancelled) {
          setQueue(queueData || []);
          setFlagged(flaggedData || []);
          setIncoming(incomingData || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>A snapshot of what needs your attention right now.</p>
      </div>

      {error && <p className="field-error" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-value">{queue.length}</div>
          <div className="stat-label">Patients awaiting verification</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{flagged.length}</div>
          <div className="stat-label">Flagged for in-person review</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{incoming.length}</div>
          <div className="stat-label">Ambulances inbound</div>
        </div>
      </div>

      <div className="section-card card">
        <div className="section-card-header spread">
          <h2>Verification queue</h2>
          <Link to="/hospital-admin/verification-queue" className="btn btn-secondary btn-sm">
            View all
          </Link>
        </div>
        {queue.length === 0 ? (
          <EmptyState title="Queue is clear" message="No patients are waiting on verification." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Urgency</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {queue.slice(0, 5).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() =>
                      navigate(`/hospital-admin/verification-queue/${item.id}`, {
                        state: { patientName: item.patient_name },
                      })
                    }
                  >
                    <td>{item.patient_name}</td>
                    <td><UrgencyBadge urgency={item.urgency_badge} /></td>
                    <td className="mono">{formatWhen(item.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section-card card">
        <div className="section-card-header spread">
          <h2>Incoming ambulances</h2>
          <Link to="/hospital-admin/incoming" className="btn btn-secondary btn-sm">
            View all
          </Link>
        </div>
        {incoming.length === 0 ? (
          <EmptyState title="No ambulances inbound" message="You'll see them here as soon as one is dispatched to you." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>ETA</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {incoming.slice(0, 5).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/hospital-admin/incoming/${item.id}`)}
                  >
                    <td>{item.patient_summary?.full_name || 'Unknown patient'}</td>
                    <td className="mono">{item.eta_minutes != null ? `${item.eta_minutes} min` : '—'}</td>
                    <td>{item.patient_summary?.chronic_conditions || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
