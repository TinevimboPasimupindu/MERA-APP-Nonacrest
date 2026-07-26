import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, ENDPOINTS } from '../../services/api';
import DashboardShell from '../../components/DashboardShell';
import StatusBadge from '../../components/StatusBadge';
import { COLORS, SHADOW } from '../../lib/theme';

// ── Assumption flag ──────────────────────────────────────────────
// Built against ENDPOINTS.emts = '/accounts/emts/' as a plain DRF
// list/create endpoint (GET to list, POST to create), since the real
// accounts/views.py + serializers.py for EMTs weren't confirmed yet
// (unlike verification, which turned out to use custom @action routes
// instead of plain REST — this might too). If GET/POST here 404s or
// rejects the field names below, check the real backend files and
// adjust CREATE_FIELDS + the two apiCall lines in this file — nothing
// else needs to change.
const CREATE_FIELDS = [
  { name: 'full_name', label: 'Full name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone_number', label: 'Phone number', type: 'text' },
];

function CreateEmtModal({ onClose, onCreated }) {
  const [form, setForm] = useState(Object.fromEntries(CREATE_FIELDS.map((f) => [f.name, ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiCall(ENDPOINTS.emts, 'POST', form);
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
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
          The EMT will need their login credentials shared with them directly —
          confirm with the backend team how those are generated (e.g. a
          temporary password, or an invite email).
        </p>
      </form>
    </div>
  );
}

export default function EmtManagement() {
  const [emts, setEmts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiCall(ENDPOINTS.emts)
      .then((data) => setEmts(Array.isArray(data) ? data : data.results || []))
      .catch((e) => setError(e.detail || 'Could not load your EMT roster.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
                {['Name', 'Email', 'Phone', 'Status'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emts.map((e) => (
                <tr key={e.id} className="mera-row" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{e.full_name || e.name || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>{e.email || '—'}</td>
                  <td style={tdStyle}>{e.phone_number || '—'}</td>
                  <td style={tdStyle}><StatusBadge status={e.is_active === false ? 'inactive' : 'active'} /></td>
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

      <style>{`
        .mera-row:hover { background: #FAFBFC; }
        .mera-row:last-child { border-bottom: none; }
      `}</style>
    </DashboardShell>
  );
}

const mutedText = { color: COLORS.inkMuted, fontSize: 13, margin: 0 };
const thStyle = { textAlign: 'left', padding: '13px 20px', fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', background: '#FAFBFC', borderBottom: `1px solid ${COLORS.border}` };
const tdStyle = { padding: '14px 20px', color: COLORS.ink };
const createBtnStyle = { padding: '10px 18px', borderRadius: 8, border: 'none', background: COLORS.red, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(2,28,57,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' };
const panelStyle = { background: '#fff', borderRadius: 14, padding: 28, width: 420, boxShadow: SHADOW.modal };
const closeBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${COLORS.border}`, fontSize: 13, boxSizing: 'border-box' };
const actionBtnStyle = { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
