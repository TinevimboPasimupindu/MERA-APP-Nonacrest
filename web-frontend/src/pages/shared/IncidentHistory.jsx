import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import EmptyState from '../../components/EmptyState';

// Read-only incident history. The backend (emergencies/history.py) scopes the
// incidents and decides the fields per role: MERA admin rows carry no
// patient_name or treatment_note keys at all, so those columns/sections are
// rendered only when the key is present rather than by checking the role.
//
// Two ways to show it, one list and one detail underneath:
// - IncidentHistorySection: embedded below the stats on the ambulance admin
//   and MERA admin dashboards; the detail opens in place.
// - IncidentHistoryList / IncidentHistoryDetail: separate routed pages
//   (hospital admin).

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

const SEARCH_DEBOUNCE_MS = 400;

const FIELD_STYLE = {
  background: 'var(--mera-surface)',
  color: 'var(--mera-text)',
  border: '1px solid var(--mera-border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
};

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

// Embedded sections sit inside a dashboard that already has its own padding,
// so they drop the page-level margins the shared .page-header/.card classes use.
function spacing(embedded) {
  return {
    header: embedded ? { padding: 0 } : undefined,
    card: { margin: embedded ? '16px 0' : '20px 28px' },
    footer: { margin: embedded ? '0 0 8px' : '0 28px 28px' },
  };
}

function IncidentList({ onSelect, searchPlaceholder, embedded }) {
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounced so a request goes out once typing pauses, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      if (next !== q) {
        setQ(next);
        setPage(1);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, q]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await apiCall(
          ENDPOINTS.incidentHistory({ page, status, q, date_from: dateFrom, date_to: dateTo })
        );
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
  }, [page, status, q, dateFrom, dateTo]);

  const filtersActive = Boolean(searchInput.trim() || status || dateFrom || dateTo);

  const clearFilters = () => {
    setSearchInput('');
    setQ('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const rows = data?.results || [];
  const showPatient = rows.length > 0 && 'patient_name' in rows[0];
  const space = spacing(embedded);
  const Title = embedded ? 'h2' : 'h1';

  return (
    <div>
      <div className="page-header" style={space.header}>
        <Title style={embedded ? { color: 'var(--mera-text)', fontSize: '1.1rem', margin: '0 0 4px' } : undefined}>
          Incidents
        </Title>
        <p>Past and current incidents, newest first. Read-only.</p>

        <div className="row gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            style={{ ...FIELD_STYLE, flex: '1 1 280px', minWidth: 220 }}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            style={FIELD_STYLE}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label}</option>
            ))}
          </select>
          <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            From{' '}
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              style={FIELD_STYLE}
            />
          </label>
          <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            To{' '}
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              style={FIELD_STYLE}
            />
          </label>
          {filtersActive && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="page-loading">
          <div className="spinner" />
        </div>
      ) : error ? (
        <p className="field-error">{error}</p>
      ) : rows.length === 0 ? (
        <div className="card section-card" style={space.card}>
          {filtersActive ? (
            <>
              <EmptyState title="No incidents match" message="Try a different search, status or date range." />
              <div style={{ textAlign: 'center' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="No incidents yet" message="Incidents will appear here once they involve you." />
          )}
        </div>
      ) : (
        <>
          <div className="card table-wrap" style={space.card}>
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
                  <tr key={row.id} onClick={() => onSelect(row.id)}>
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

          <div className="row gap-sm" style={{ ...space.footer, alignItems: 'center', justifyContent: 'flex-end' }}>
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

function IncidentDetail({ id, onBack, embedded }) {
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

  const space = spacing(embedded);
  const backButton = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 8, padding: '4px 0' }}>
      ← Back to incidents
    </button>
  );

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="page-header" style={space.header}>
        {backButton}
        <p className="field-error">{error || 'Incident not found.'}</p>
      </div>
    );
  }

  const hasNotes = 'treatment_note' in incident;
  const note = incident.treatment_note;
  const Title = embedded ? 'h2' : 'h1';

  return (
    <div>
      <div className="page-header spread" style={space.header}>
        <div>
          {backButton}
          <Title style={embedded ? { color: 'var(--mera-text)', fontSize: '1.1rem', margin: '0 0 4px' } : undefined}>
            {'patient_name' in incident ? incident.patient_name || 'Unknown patient' : `Incident ${shortId(incident.id)}`}
          </Title>
          <p className="mono">{incident.id}</p>
        </div>
        <IncidentStatusBadge status={incident.status} />
      </div>

      <div className="card section-card" style={space.card}>
        <div className="section-card-header">
          <h2>Response</h2>
        </div>
        <div className="profile-grid">
          <Field label="Ambulance service" value={incident.institution} />
          <Field label="Responding EMT" value={incident.responding_emt?.full_name} />
          <Field label="Hospital" value={incident.hospital} />
        </div>
      </div>

      <div className="card section-card" style={space.card}>
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
        <div className="card section-card" style={space.card}>
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

// Dashboard section: the list stays mounted (hidden) while a detail is open,
// so going back keeps the search, filters and page the user had.
export function IncidentHistorySection({ searchPlaceholder }) {
  const [selectedId, setSelectedId] = useState(null);

  return (
    <section style={{ marginTop: 32 }}>
      <div style={selectedId ? { display: 'none' } : undefined}>
        <IncidentList embedded onSelect={setSelectedId} searchPlaceholder={searchPlaceholder} />
      </div>
      {selectedId && <IncidentDetail embedded id={selectedId} onBack={() => setSelectedId(null)} />}
    </section>
  );
}

export function IncidentHistoryList({ basePath, searchPlaceholder }) {
  const navigate = useNavigate();
  return <IncidentList onSelect={(id) => navigate(`${basePath}/${id}`)} searchPlaceholder={searchPlaceholder} />;
}

export function IncidentHistoryDetail({ basePath }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return <IncidentDetail id={id} onBack={() => navigate(basePath)} />;
}
