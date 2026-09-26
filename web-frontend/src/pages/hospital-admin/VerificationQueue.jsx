import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { UrgencyBadge } from '../../components/Badge';
import EmptyState from '../../components/EmptyState';

// The queue endpoint returns both pending and info_requested requests.
// They're split here: "Queue" is what's ready for you to review (including
// patients who've answered a request for more info), "Awaiting patient" is
// what's waiting on the patient to respond.
const TABS = [
  {
    key: 'queue', label: 'Queue', endpoint: ENDPOINTS.verificationQueue,
    filter: (item) => item.status !== 'info_requested',
  },
  {
    key: 'awaiting', label: 'Awaiting patient', endpoint: ENDPOINTS.verificationQueue,
    filter: (item) => item.status === 'info_requested',
  },
  { key: 'approved', label: 'Approved', endpoint: ENDPOINTS.verificationApproved },
  { key: 'flagged', label: 'Flagged', endpoint: ENDPOINTS.verificationFlagged },
];

const EMPTY_COPY = {
  queue: ['Queue is clear', 'No patients are currently waiting on verification.'],
  awaiting: ['Nothing outstanding', "You're not waiting on any patient to send more information."],
  approved: ['No approved patients', 'Nothing has been approved yet.'],
  flagged: ['No flagged patients', 'Nothing has been flagged yet.'],
};

export default function VerificationQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('queue');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const activeTab = TABS.find((t) => t.key === tab);

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = (await apiCall(activeTab.endpoint)) || [];
        if (!cancelled) setItems(activeTab.filter ? data.filter(activeTab.filter) : data);
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load this list.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const openItem = (item) => {
    if (tab === 'approved') {
      navigate(`/hospital-admin/patients/${item.patient_id}`, {
        state: { patientName: item.patient_name },
      });
      return;
    }
    navigate(`/hospital-admin/verification-queue/${item.id}`, {
      state: { patientName: item.patient_name },
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Patient verification queue</h1>
        <p>Review submitted medical profiles and approve, flag, or request more information.</p>
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">
          <div className="spinner" />
        </div>
      ) : error ? (
        <p className="field-error">{error}</p>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState title={EMPTY_COPY[tab][0]} message={EMPTY_COPY[tab][1]} />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                {tab === 'queue' && <th>Urgency</th>}
                <th>{tab === 'awaiting' ? 'Waiting since' : 'Submitted'}</th>
                {tab === 'approved' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => openItem(item)}>
                  <td>
                    {item.patient_name}
                    {tab === 'queue' && item.patient_responded_at && (
                      <span className="badge badge-approaching" style={{ marginLeft: 8 }}>
                        Responded to your request
                      </span>
                    )}
                  </td>
                  {tab === 'queue' && (
                    <td><UrgencyBadge urgency={item.urgency_badge} /></td>
                  )}
                  <td className="mono">{formatWhen(tab === 'awaiting' ? item.reviewed_at : item.submitted_at)}</td>
                  {tab === 'approved' && (
                    <td><span className="btn btn-secondary btn-sm">Update record</span></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
