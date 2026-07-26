import { useState, useEffect, useCallback } from 'react';
import { apiCall, ENDPOINTS } from '../../services/api';
import DashboardShell from '../../components/DashboardShell';
import StatusBadge from '../../components/StatusBadge';

// Dark theme + accent colors. 'navy' (name kept for minimal diff) is
// Colors.ambulance (#F2731A) from the mobile app's constants/theme.ts —
// ambulance-admin's own accent, distinct from the shared blue on Login.jsx.
const COLORS = {
  ink: '#FFFFFF',
  inkMuted: '#A0A0B0',
  inkFaint: '#7D7D93',
  panel: '#404259',
  border: '#5a5c73',
  navy: '#F2731A',
  red: '#f28b8b',
};
const SHADOW = {
  card: '0 1px 3px rgba(0,0,0,0.4)',
  modal: '0 8px 30px rgba(0,0,0,0.55)',
};

const CREATE_FIELDS = [
  { name: 'full_name', label: 'Full name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone_number', label: 'Phone number', type: 'text' },
  { name: 'password', label: 'Password', type: 'password' },
  { name: 'confirm_password', label: 'Confirm password', type: 'password' },
];

function CreateEmtModal({ onClose, onCreated }) {
  const [form, setForm] = useState(Object.fromEntries(CREATE_FIELDS.map((f) => [f.name, ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await apiCall(ENDPOINTS.createEmt, 'POST', form);
      onCreated();
    } catch (err) {
      setError(err.detail || 'Could not create that EMT account. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={panelStyle} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
            Create EMT account
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        {CREATE_FIELDS.map((f) => (
          <div key={f.name} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{f.label}</label>
            <input
              type={f.type}
              required
              value={form[f.name]}
              onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
              style={inputStyle}
            />
          </div>
        ))}

        {error && <p style={{ color: COLORS.red, fontSize: 12.5, margin: '0 0 12px' }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ ...actionBtnStyle, background: COLORS.navy, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p style={{ fontSize: 11.5, color: COLORS.inkFaint, marginTop: 12, lineHeight: 1.5 }}>
          Share this password with the EMT directly — there's no invite-email
          flow yet, so this is how they'll sign in for the first time.
        </p>
      </form>
    </div>
  );
}

const EDIT_FIELDS = [
  { name: 'full_name', label: 'Full name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone_number', label: 'Phone number', type: 'text' },
];

function EditEmtModal({ emt, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: emt.full_name || '',
    email: emt.email || '',
    phone_number: emt.phone_number || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiCall(ENDPOINTS.emtUpdate(emt.id), 'PATCH', form);
      onSaved();
    } catch (err) {
      setError(err.detail || 'Could not save changes. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={panelStyle} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
            Edit EMT account
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        {EDIT_FIELDS.map((f) => (
          <div key={f.name} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{f.label}</label>
            <input
              type={f.type}
              required
              value={form[f.name]}
              onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
              style={inputStyle}
            />
          </div>
        ))}

        {error && <p style={{ color: COLORS.red, fontSize: 12.5, margin: '0 0 12px' }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ ...actionBtnStyle, background: COLORS.navy, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

export default function EmtManagement() {
  const [emts, setEmts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingEmt, setEditingEmt] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiCall(ENDPOINTS.myEmts)
      .then((data) => setEmts(Array.isArray(data) ? data : data.results || []))
      .catch((e) => setError(e.detail || 'Could not load your EMT roster.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (emt) => {
    if (!window.confirm('Remove this EMT?')) return;
    setDeletingId(emt.id);
    try {
      await apiCall(ENDPOINTS.emtUpdate(emt.id), 'DELETE');
      setEmts((prev) => prev.filter((e) => e.id !== emt.id));
    } catch (err) {
      window.alert(err.detail || 'Could not remove that EMT.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardShell
      title="EMT Management"
      subtitle="Create and manage EMT accounts for your ambulance service"
      actions={
        <button onClick={() => setShowCreate(true)} style={createBtnStyle}>
          + Create EMT
        </button>
      }
    >
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: SHADOW.card }}>
        {loading && <p style={{ padding: 28, ...mutedText }}>Loading…</p>}
        {error && <p style={{ padding: 28, ...mutedText, color: COLORS.red }}>{error}</p>}
        {!loading && !error && emts.length === 0 && (
          <p style={{ padding: 28, ...mutedText }}>No EMT accounts yet — create your first one above.</p>
        )}
        {!loading && !error && emts.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Name', 'Email', 'Phone', 'Status', 'Actions'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emts.map((e) => (
                <tr key={e.id} className="mera-row" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{e.full_name || e.name || '—'}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{e.email || '—'}</td>
                  <td style={tdStyle}>{e.phone_number || '—'}</td>
                  <td style={tdStyle}><StatusBadge status={e.is_active === false ? 'inactive' : 'active'} /></td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setEditingEmt(e)} style={rowBtnStyle}>Edit</button>
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        disabled={deletingId === e.id}
                        style={{ ...rowBtnStyle, color: COLORS.red, opacity: deletingId === e.id ? 0.5 : 1 }}
                      >
                        {deletingId === e.id ? 'Removing…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateEmtModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {editingEmt && (
        <EditEmtModal
          emt={editingEmt}
          onClose={() => setEditingEmt(null)}
          onSaved={() => { setEditingEmt(null); load(); }}
        />
      )}

      <style>{`
        .mera-row:hover { background: rgba(255,255,255,0.03); }
        .mera-row:last-child { border-bottom: none; }
      `}</style>
    </DashboardShell>
  );
}

const mutedText = { color: COLORS.inkMuted, fontSize: 13, margin: 0 };
const thStyle = { textAlign: 'left', padding: '13px 20px', fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${COLORS.border}` };
const tdStyle = { padding: '14px 20px', color: COLORS.ink, textAlign: 'left' };
const rowBtnStyle = { background: 'none', border: 'none', color: COLORS.navy, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 };
const createBtnStyle = { padding: '10px 18px', borderRadius: 8, border: 'none', background: COLORS.navy, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(2,28,57,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' };
const panelStyle = { background: COLORS.panel, borderRadius: 14, padding: 28, width: 420, boxShadow: SHADOW.modal };
const closeBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${COLORS.border}`, background: '#0F0F1A', color: COLORS.ink, fontSize: 13, boxSizing: 'border-box' };
const actionBtnStyle = { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
