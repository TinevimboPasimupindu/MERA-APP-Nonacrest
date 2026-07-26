import { useEffect, useState } from 'react';
import { apiCall, ENDPOINTS } from '../../services/api';
import DashboardShell from '../../components/DashboardShell';

// Dark theme + accent colors — same palette as EmtManagement.jsx.
// 'accent' is Colors.ambulance (#F2731A) from the mobile app's
// constants/theme.ts, matching this dashboard's orange theme.
const COLORS = {
  ink: '#FFFFFF',
  inkMuted: '#A0A0B0',
  panel: '#404259',
  border: '#5a5c73',
  accent: '#F2731A',
  red: '#f28b8b',
};

// Option A (no backend change): pull the raw EMT list and incident list
// from the two endpoints that already exist, and count client-side.
const ACTIVE_STATUSES = new Set(['dispatched', 'on_the_way', 'arrived_on_scene']);

export default function Dashboard() {
  const [emts, setEmts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([apiCall(ENDPOINTS.myEmts), apiCall(ENDPOINTS.myResponses)])
      .then(([emtsData, incidentsData]) => {
        if (cancelled) return;
        setEmts(Array.isArray(emtsData) ? emtsData : emtsData.results || []);
        setIncidents(Array.isArray(incidentsData) ? incidentsData : incidentsData.results || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.detail || 'Could not load dashboard stats.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    { label: 'Total EMTs', value: emts.length },
    { label: 'Total incidents handled', value: incidents.length },
    { label: 'Active / in-progress', value: incidents.filter((i) => ACTIVE_STATUSES.has(i.status)).length },
    { label: 'Completed', value: incidents.filter((i) => i.status === 'completed').length },
  ];

  return (
    <DashboardShell title="Dashboard" subtitle="A snapshot of your service's activity">
      {error && <p style={{ color: COLORS.red, fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {loading ? (
        <p style={{ color: COLORS.inkMuted, fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ fontSize: '2rem', fontWeight: 700, color: COLORS.accent }}>{s.value}</div>
              <div style={{ color: COLORS.inkMuted, fontSize: '0.85rem', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
