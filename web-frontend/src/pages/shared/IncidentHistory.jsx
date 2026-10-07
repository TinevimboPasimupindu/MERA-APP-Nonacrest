import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import EmptyState from '../../components/EmptyState';

// Read-only incident history, shared by the ambulance admin, hospital and
// MERA admin dashboards. The backend (emergencies/history.py) scopes the
// incidents and decides the fields per role: MERA admin rows carry no
// patient_name or treatment_note keys at all, so those columns/sections are
// rendered only when the key is present rather than by checking the role.

const STATUS = {
  pending_confirmation: { cls: 'badge-neutral', label: 'Pending confirmation' },
  active: { cls: 'badge-approaching', label: 'Awaiting ambulance' },
  dispatched: { cls: 'badge-new', label: 'Dispatched' },
  on_the_way: { cls: 'badge-new', label: 'On the way' },
  arrived_on_scene: { cls: 'badge-approaching', label: 'Arrived on scene' },
  completed: { cls: 'badge-success', label: 'Completed' },
  cancelled: { cls: 'badge-neutral', label: 'Cancelled' },
};

const TIMELINE = [
  ['triggered_at', 'SOS triggered'],
  ['confirmed_at', 'Confirmed'],
  ['accepted_at', 'Ambulance accepted'],
  ['arrived_at', 'Arrived on scene'],
  ['completed_at', 'Completed'],
  ['cancelled_at', 'Cancelled'],
];

function IncidentStatusBadge({ status }) {
  const meta = STATUS[status] || { cls: 'badge-neutral', label: status };
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function shortId(id) {
  return String(id).slice(0, 8).toUpperCase();
}

export function IncidentHistoryList({ basePath }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await apiCall(ENDPOINTS.incidentHistory({ page, status }));
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.detail || 'Could not load incidents.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, status]);

  const rows = data?.results || [];
  const showPatient = rows.length > 0 && 'patient_name' in rows[0];

  return (
    <div>
      <div className="page-header spread">
        <div>
          <h1>Incidents</h1>
          <p>Past and current incidents, newest first. Read-only.</p>
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          style={{
            background: 'var(--mera-surface)',
            color: 'var(--mera-text)',
            border: '1px solid var(--mera-border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
          }}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="page-loading">
          <div className="spinner" />
        </div>
      ) : error ? (
        <p className="field-error">{error}</p>
      ) : rows.length === 0 ? (
        <div className="card section-card">
          <EmptyState
            title="No incidents"
            message={status ? 'No incidents with this status.' : 'Incidents will appear here once they involve you.'}
          />
        </div>
      ) : (
        <>
          <div className="card table-wrap" style={{ margin: '20px 28px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Triggered</th>
                  {showPatient ? <th>Patient</th> : <th>Incident</th>}
                  <th>Ambulance service</th>
                  <th>Responding EMT</th>
                  <th>Hospital</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => navigate(`${basePath}/${row.id}`)}>
                    <td>{formatTime(row.triggered_at)}</td>
                    {showPatient ? (
                      <td>{row.patient_name || 'Unknown patient'}</td>
                    ) : (
                      <td className="mono">{shortId(row.id)}</td>
                    )}
                    <td>{row.institution || '—'}</td>
                    <td>{row.responding_emt?.full_name || '—'}</td>
                    <td>{row.hospital || '—'}</td>
                    <td><IncidentStatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row gap-sm" style={{ margin: '0 28px 28px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {data.count} incident{data.count === 1 ? '' : 's'}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!data.previous} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!data.next} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function IncidentHistoryDetail({ basePath }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await apiCall(ENDPOINTS.incidentHistoryDetail(id));
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

  const hasNotes = 'treatment_note' in incident;
  const note = incident.treatment_note;

  return (
    <div>
      <div className="page-header spread">
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(basePath)} style={{ marginBottom: 8, padding: '4px 0' }}>
            ← Back to incidents
          </button>
          <h1>{'patient_name' in incident ? incident.patient_name || 'Unknown patient' : `Incident ${shortId(incident.id)}`}</h1>
          <p className="mono">{incident.id}</p>
        </div>
        <IncidentStatusBadge status={incident.status} />
      </div>

      <div className="card section-card">
        <div className="section-card-header">
          <h2>Response</h2>
        </div>
        <div className="profile-grid">
          <Field label="Ambulance service" value={incident.institution} />
          <Field label="Responding EMT" value={incident.responding_emt?.full_name} />
          <Field label="Hospital" value={incident.hospital} />
        </div>
      </div>

      <div className="card section-card">
        <div className="section-card-header">
          <h2>Timeline</h2>
        </div>
        <div className="profile-grid">
          {TIMELINE.map(([key, label]) => (
            <Field key={key} label={label} value={incident[key] && formatTime(incident[key])} />
          ))}
        </div>
      </div>

      {hasNotes && (
        <div className="card section-card">
          <div className="section-card-header">
            <h2>Treatment notes from EMT</h2>
          </div>
          {!note ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No treatment notes were recorded.</p>
          ) : (
            <>
              <div className="profile-grid">
                <Field label="Chief complaint" value={note.chief_complaint} />
                <Field label="Treatment administered" value={note.treatment_administered} />
                <Field label="Blood pressure" value={note.blood_pressure} />
                <Field label="SpO2" value={note.spo2} />
                <Field label="Heart rate" value={note.heart_rate} />
                <Field label="Medications given" value={note.medications_given} />
              </div>
              <Field label="Additional notes" value={note.additional_notes} full />
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                {note.is_draft ? 'Draft, not yet submitted.' : `Submitted ${formatTime(note.submitted_at)}.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, full = false }) {
  return (
    <div className="profile-field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div className="profile-field-label">{label}</div>
      <div className="profile-field-value">{value || '—'}</div>
    </div>
  );
}
