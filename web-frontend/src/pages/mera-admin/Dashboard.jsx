import { useEffect, useState } from 'react';
import { apiCall, ENDPOINTS } from '../../services/api';

// Dark theme + accent colors — self-contained COLORS object, same approach
// as ambulance-admin/Dashboard.jsx. 'accent' pulls the shared --mera-accent
// CSS var (same blue as Login.jsx) rather than a role-specific hex, since
// MERA admin is the platform-owner role and should visually match Login.
const COLORS = {
  ink: '#FFFFFF',
  inkMuted: '#A0A0B0',
  panel: '#404259',
  border: '#5a5c73',
  accent: 'var(--mera-accent)',
  red: '#f28b8b',
};

// GET /auth/admin/stats/ returns these five counts (see accounts/views.py
// PlatformStatsView) — key order here is the display order.
const STAT_FIELDS = [
  { key: 'total_patients', label: 'Patients' },
  { key: 'total_hospitals', label: 'Hospitals' },
  { key: 'total_ambulance_services', label: 'Ambulance services' },
  { key: 'total_emts', label: 'EMTs' },
  { key: 'total_incidents', label: 'Incidents (all time)' },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    apiCall(ENDPOINTS.stats)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.detail || 'Could not load platform stats.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', color: COLORS.ink, fontSize: '1.4rem' }}>Dashboard</h1>
        <p style={{ margin: 0, color: COLORS.inkMuted, fontSize: '0.85rem' }}>
          Platform-wide activity at a glance.
        </p>
      </div>

      {error && <p style={{ color: COLORS.red, fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {loading ? (
        <p style={{ color: COLORS.inkMuted, fontSize: 13 }}>Loading…</p>
      ) : (
        stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            {STAT_FIELDS.map((f) => (
              <div
                key={f.key}
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: '2rem', fontWeight: 700, color: COLORS.accent }}>
                  {stats[f.key] ?? '—'}
                </div>
                <div style={{ color: COLORS.inkMuted, fontSize: '0.85rem', marginTop: 4 }}>{f.label}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
