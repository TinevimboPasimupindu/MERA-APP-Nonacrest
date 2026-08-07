import { useState, useEffect, useRef } from 'react';
import { apiCall, ENDPOINTS } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Dark theme + accent colors — self-contained, same approach used across
// every mera-admin page (see Users.jsx/Institutions.jsx's own COLORS
// comments) — 'accent' is the shared --mera-accent blue, matching Login.jsx.
const COLORS = {
  ink: '#FFFFFF',
  inkMuted: '#A0A0B0',
  panel: '#404259',
  border: '#5a5c73',
  accent: 'var(--mera-accent)',
  red: '#f28b8b',
};

// Matches backend/accounts/models.py HOSPITAL_ROLES/AMBULANCE_ROLES — picks
// which "name" field the Edit modal shows for a given account's role.
const HOSPITAL_ROLE_SET = new Set(['hospital', 'hospital_admin']);
const AMBULANCE_ROLE_SET = new Set(['ambulance_service', 'ambulance_admin']);

function editFieldsForRole(role) {
  if (HOSPITAL_ROLE_SET.has(role)) {
    return [
      { name: 'facility_name', label: 'Facility name', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
    ];
  }
  if (AMBULANCE_ROLE_SET.has(role)) {
    return [
      { name: 'service_name', label: 'Service name', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
    ];
  }
  // patient, emt, mera_admin
  return [
    { name: 'full_name', label: 'Full name', type: 'text' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone_number', label: 'Phone number', type: 'text' },
  ];
}

// PATCH /auth/admin/users/{id}/ — full_name/email/phone_number/
// facility_name/service_name only (role and password are not editable
// here). Prefilled straight from the row data passed in, which must
// include the raw fields (not just display_name) — see
// AdminUserListSerializer/InstitutionSummarySerializer's comments on why
// that matters for safety.
function EditUserModal({ user, onClose, onSaved }) {
  const fields = editFieldsForRole(user.role);
  const [form, setForm] = useState(Object.fromEntries(fields.map((f) => [f.name, user[f.name] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const updated = await apiCall(ENDPOINTS.editUser(user.id), 'PATCH', form);
      onSaved(updated);
    } catch (err) {
      setError(err.detail || err.email?.[0] || 'Could not save changes. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={panelStyle} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
            Edit {user.display_name || user.email}
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        {fields.map((f) => (
          <div key={f.name} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{f.label}</label>
            <input
              type={f.type}
              required={f.name === 'email'}
              value={form[f.name]}
              onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
              style={inputStyle}
            />
          </div>
        ))}

        {error && <p style={{ color: COLORS.red, fontSize: 12.5, margin: '0 0 12px' }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ ...actionBtnStyle, background: COLORS.accent, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

// Three-dot actions menu shared by Users.jsx and Institutions.jsx — both
// pages act on the same underlying accounts via the same
// PATCH /auth/admin/users/{id}/[deactivate|reactivate|] endpoints, just
// surfaced from two different list views, so this owns the whole
// interaction (menu, confirm/alert, edit modal, busy/error state) itself
// rather than each page reimplementing it. `user` must come from a
// serializer that includes is_active (AdminUserListSerializer or
// InstitutionSummarySerializer both now do) — without it every row would
// look active regardless of its real state. `onChanged(patch)` is called
// with a partial or full update for the caller to merge into its own row.
export default function UserRowActions({ user, onChanged }) {
  const { user: me } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const isSelf = user.id === me?.id;
  const isInactive = user.is_active === false;

  const handleDeactivate = async () => {
    if (!window.confirm(`Deactivate ${user.display_name || user.email}? They will no longer be able to log in.`)) return;
    setError(null);
    setBusy(true);
    try {
      const response = await apiCall(ENDPOINTS.deactivateUser(user.id), 'PATCH');
      onChanged({ is_active: false });
      // deactivated_emt_count is only present/nonzero for an ambulance_admin
      // whose crew got cascade-deactivated with it — surface that
      // explicitly since neither list view has a column for it.
      if (response.deactivated_emt_count) {
        window.alert(response.detail);
      }
    } catch (err) {
      // The backend blocks deactivating your own account (400, self-lockout
      // guard) — the menu already hides that option on your own row, but
      // this catch is a defensive backstop so a rejection never surfaces as
      // a raw/unhandled failure, just a clear inline message.
      setError(err.detail || 'Could not deactivate that account.');
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await apiCall(ENDPOINTS.reactivateUser(user.id), 'PATCH');
      onChanged({ is_active: true });
      if (response.reactivated_emt_count) {
        window.alert(response.detail);
      }
    } catch (err) {
      setError(err.detail || 'Could not reactivate that account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
        <button type="button" onClick={() => setOpen((o) => !o)} style={menuBtnStyle} aria-label="Actions">
          ⋮
        </button>
        {open && (
          <div style={menuDropdownStyle}>
            <button type="button" style={menuItemStyle} onClick={() => { setOpen(false); setEditing(true); }}>
              Edit
            </button>
            {isInactive ? (
              <button
                type="button"
                style={menuItemStyle}
                disabled={busy}
                onClick={() => { setOpen(false); handleReactivate(); }}
              >
                {busy ? 'Reactivating…' : 'Reactivate'}
              </button>
            ) : isSelf ? (
              <div
                style={{ ...menuItemStyle, color: COLORS.inkMuted, cursor: 'default' }}
                title="You can't deactivate your own account."
              >
                Deactivate — (you)
              </div>
            ) : (
              <button
                type="button"
                style={{ ...menuItemStyle, color: COLORS.red }}
                disabled={busy}
                onClick={() => { setOpen(false); handleDeactivate(); }}
              >
                {busy ? 'Deactivating…' : 'Deactivate'}
              </button>
            )}
          </div>
        )}
      </div>
      {error && <div style={{ color: COLORS.red, fontSize: 11.5, marginTop: 4 }}>{error}</div>}

      {editing && (
        <EditUserModal
          user={user}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { onChanged(updated); setEditing(false); }}
        />
      )}
    </>
  );
}

const menuBtnStyle = { background: 'none', border: 'none', color: COLORS.ink, fontSize: 18, fontWeight: 700, cursor: 'pointer', padding: '2px 10px', borderRadius: 6, lineHeight: 1 };
const menuDropdownStyle = { position: 'absolute', right: 0, top: '100%', marginTop: 4, background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 20, minWidth: 150, overflow: 'hidden' };
const menuItemStyle = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: COLORS.ink, fontSize: 12.5, fontWeight: 600, padding: '10px 14px', cursor: 'pointer' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(2,28,57,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' };
const panelStyle = { background: COLORS.panel, borderRadius: 14, padding: 28, width: 420, boxShadow: '0 8px 30px rgba(0,0,0,0.55)' };
const closeBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${COLORS.border}`, background: '#0F0F1A', color: COLORS.ink, fontSize: 13, boxSizing: 'border-box' };
const actionBtnStyle = { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
