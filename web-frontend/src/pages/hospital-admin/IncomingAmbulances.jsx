import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import { StatusBadge } from '../../components/Badge';
import EmptyState from '../../components/EmptyState';

// No WebSockets/Celery/Redis in this project (see PROJECT_CONTEXT.md) —
// polling is the realistic way to keep this list current while the page
// is open.
const POLL_INTERVAL_MS = 15000;
// How long a newly-appeared row stays highlighted — see the ordering note
// in load() below for why new rows are highlighted instead of sorted in.
const NEW_ROW_HIGHLIGHT_MS = 4000;

export default function IncomingAmbulances() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [newIds, setNewIds] = useState(new Set());
  const highlightTimers = useRef({});

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function load(isInitial) {
      if (isInitial) {
        setLoading(true);
        setError('');
      } else {
        setRefreshing(true);
      }

      try {
        const data = await apiCall(ENDPOINTS.incomingPatients);
        if (cancelled) return;

        if (isInitial) {
          setItems(data || []);
        } else {
          setItems((prev) => {
            const prevIds = new Set(prev.map((it) => it.id));
            const freshById = new Map((data || []).map((it) => [it.id, it]));

            // Keep every row exactly where it already is on screen, just
            // refreshed with whatever the poll returned for it (ETA counts
            // down, status badge updates, etc. all stay live) — and drop
            // rows no longer in the incoming set (arrived/completed/
            // cancelled). The backend sorts by eta_minutes, which changes
            // constantly as ambulances get closer, so re-adopting that
            // order wholesale on every poll would shuffle rows out from
            // under a hospital admin mid-read. Brand-new incidents are
            // appended at the end rather than inserted wherever their ETA
            // would sort them, for the same reason — and briefly
            // highlighted (see newIds below) so a newly-dispatched
            // ambulance doesn't just quietly land at the bottom unnoticed.
            const kept = prev
              .filter((it) => freshById.has(it.id))
              .map((it) => freshById.get(it.id));
            const appended = (data || []).filter((it) => !prevIds.has(it.id));

            if (appended.length > 0) {
              const ids = appended.map((it) => it.id);
              setNewIds((prevNew) => new Set([...prevNew, ...ids]));
              ids.forEach((id) => {
                clearTimeout(highlightTimers.current[id]);
                highlightTimers.current[id] = setTimeout(() => {
                  setNewIds((prevNew) => {
                    const next = new Set(prevNew);
                    next.delete(id);
                    return next;
                  });
                }, NEW_ROW_HIGHLIGHT_MS);
              });
            }

            return [...kept, ...appended];
          });
        }
        setError('');
      } catch (err) {
        if (cancelled) return;
        // Only the initial load's failure is shown as a page-level error —
        // a background poll failing (e.g. a brief network hiccup) keeps
        // showing the last known-good list instead of yanking it away
        // every 15s. It just quietly retries on the next interval.
        if (isInitial) setError(err.detail || 'Could not load incoming ambulances.');
      } finally {
        if (!cancelled) {
          if (isInitial) setLoading(false);
          else setRefreshing(false);
        }
      }
    }

    function startPolling() {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => load(false), POLL_INTERVAL_MS);
    }

    // Backgrounded tabs get their timers throttled/suspended by the browser
    // (Chrome in particular can push a 15s interval out several minutes),
    // so a hidden tab's setInterval can't be trusted to fire on schedule.
    // Instead we pause it outright on hide and, on return, do an immediate
    // fetch (the list is likely stale by however long the tab was away)
    // plus restart the interval on a fresh 15s cadence.
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        load(false);
        startPolling();
      }
    }

    load(true);
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      Object.values(highlightTimers.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <div>
      <div className="page-header spread">
        <div>
          <h1>Incoming ambulances</h1>
          <p>Patients currently en route to your hospital, sorted by ETA.</p>
        </div>
        {refreshing && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Refreshing…
          </span>
        )}
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
                <tr
                  key={item.id}
                  onClick={() => navigate(`/hospital-admin/incoming/${item.id}`)}
                  className={newIds.has(item.id) ? 'newly-arrived' : ''}
                >
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

      <style>{`
        .newly-arrived { animation: mera-new-row-highlight ${NEW_ROW_HIGHLIGHT_MS}ms ease-out; }
        @keyframes mera-new-row-highlight {
          0% { background: var(--hospital-accent-tint); }
          100% { background: transparent; }
        }
      `}</style>
    </div>
  );
}
