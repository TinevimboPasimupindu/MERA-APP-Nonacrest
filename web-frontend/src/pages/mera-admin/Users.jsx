import { useState, useEffect, useCallback } from 'react';
import { apiCall, ENDPOINTS } from '../../services/api';
import StatusBadge from '../../components/StatusBadge';
import UserRowActions from '../../components/UserRowActions';

// Dark theme + accent colors — same self-contained-COLORS approach as
// ambulance-admin/EmtManagement.jsx, but 'accent' is the shared --mera-accent
// blue (matches Login.jsx) since this is the MERA admin (platform-owner) page.
const COLORS = {
  ink: '#FFFFFF',
  inkMuted: '#A0A0B0',
  panel: '#404259',
  border: '#5a5c73',
  accent: 'var(--mera-accent)',
  red: '#f28b8b',
};
const SHADOW = { card: '0 1px 3px rgba(0,0,0,0.4)' };

// Every role value currently live on the User model — see
// PROJECT_CONTEXT.md "Role naming" (old/new names still coexist).
const ROLE_LABELS = {
  patient: 'Patient',
  hospital: 'Hospital (legacy)',
  hospital_admin: 'Hospital Admin',
  ambulance_service: 'Ambulance (legacy)',
  ambulance_admin: 'Ambulance Admin',
  emt: 'EMT',
  mera_admin: 'MERA Admin',
};

function RoleBadge({ role }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        color: COLORS.inkMuted,
        background: 'rgba(160,160,176,0.15)',
      }}
    >
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce the search box — wait for typing to pause before hitting the
  // API, same pattern as hospital-admin/Patients.jsx.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    apiCall(`${ENDPOINTS.users}${qs}`)
      // The backend already orders active accounts first, then deactivated
      // (see AllUsersListView). Rendered below in exactly that order —
      // no client-side .sort() here, so this stays true even if the
      // backend's ordering rule changes later.
      .then((data) => setUsers(Array.isArray(data) ? data : data.results || []))
      .catch((e) => setError(e.detail || 'Could not load the user list.'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const patchUser = (id, patch) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', color: COLORS.ink, fontSize: '1.4rem' }}>Users</h1>
        <p style={{ margin: 0, color: COLORS.inkMuted, fontSize: '0.85rem' }}>
          Every account on the platform, any role.
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, maxWidth: 360 }}
        />
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: SHADOW.card }}>
        {loading && <p style={{ padding: 28, ...mutedText }}>Loading…</p>}
        {error && <p style={{ padding: 28, ...mutedText, color: COLORS.red }}>{error}</p>}
        {!loading && !error && users.length === 0 && (
          <p style={{ padding: 28, ...mutedText }}>{search ? 'No accounts match that search.' : 'No accounts found.'}</p>
        )}
        {!loading && !error && users.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Name', 'Role', 'Email', 'Status', 'Joined', 'Actions'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isInactive = u.is_active === false;
                return (
                  <tr key={u.id} className="mera-row" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{u.display_name || '—'}</td>
                    <td style={tdStyle}><RoleBadge role={u.role} /></td>
                    <td style={{ ...tdStyle, fontSize: 12.5 }}>{u.email || '—'}</td>
                    <td style={tdStyle}><StatusBadge status={isInactive ? 'inactive' : 'active'} /></td>
                    <td style={{ ...tdStyle, fontSize: 12.5, color: COLORS.inkMuted }}>{formatWhen(u.date_joined)}</td>
                    <td style={tdStyle}>
                      <UserRowActions user={u} onChanged={(patch) => patchUser(u.id, patch)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .mera-row:hover { background: rgba(255,255,255,0.03); }
        .mera-row:last-child { border-bottom: none; }
      `}</style>
    </div>
  );
}

const mutedText = { color: COLORS.inkMuted, fontSize: 13, margin: 0 };
const thStyle = { textAlign: 'left', padding: '13px 20px', fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${COLORS.border}` };
const tdStyle = { padding: '14px 20px', color: COLORS.ink, textAlign: 'left' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${COLORS.border}`, background: '#0F0F1A', color: COLORS.ink, fontSize: 13, boxSizing: 'border-box' };
