import { useState, useEffect, useRef } from 'react';
import { apiCall, ENDPOINTS } from '../services/api';
import { firstFieldError, formFormatError } from '../utils/validation';
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

// Institutional onboarding documents per institution type — upload field
// names match InstitutionDocumentsUpdateSerializer (and the creation
// serializers), urlField is where the current copy lives on the row.
function documentFieldsForRole(role) {
  if (HOSPITAL_ROLE_SET.has(role)) {
    return [
      { name: 'health_facility_certificate', label: 'Health Facility Certificate', urlField: 'health_facility_certificate_url' },
      { name: 'cipc_registration_document', label: 'CIPC Registration Document', urlField: 'cipc_registration_url' },
    ];
  }
  if (AMBULANCE_ROLE_SET.has(role)) {
    return [
      { name: 'ems_operating_license', label: 'EMS Operating License', urlField: 'ems_operating_license_url' },
      { name: 'hpcsa_doh_registration_document', label: 'HPCSA/DoH Registration Document', urlField: 'hpcsa_doh_registration_url' },
    ];
  }
  return [];
}

// PATCH /auth/admin/users/{id}/ — full_name/email/phone_number/
// facility_name/service_name only (role and password are not editable
// here). Prefilled straight from the row data passed in, which must
// include the raw fields (not just display_name) — see
// AdminUserListSerializer/InstitutionSummarySerializer's comments on why
// that matters for safety.
function EditUserModal({ user, onClose, onSaved }) {
  const fields = editFieldsForRole(user.role);
  const documentFields = documentFieldsForRole(user.role);
  const [form, setForm] = useState(Object.fromEntries(fields.map((f) => [f.name, user[f.name] ?? ''])));
  // Chosen replacement/backfill files, keyed by upload field name.
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const formatError = formFormatError(form, fields);
    if (formatError) {
      setError(formatError);
      return;
    }
    setBusy(true);
    try {
      let updated = await apiCall(ENDPOINTS.editUser(user.id), 'PATCH', form);
      const chosen = documentFields.filter((d) => files[d.name]);
      if (chosen.length) {
        // Separate multipart request (apiCall sends FormData as-is). If
        // this part fails the details above are already saved, so the
        // error says so rather than implying nothing changed.
        const payload = new FormData();
        chosen.forEach((d) => payload.append(d.name, files[d.name]));
        try {
          updated = { ...updated, ...(await apiCall(ENDPOINTS.institutionDocuments(user.id), 'PATCH', payload)) };
        } catch (docErr) {
          onSaved(updated, { keepOpen: true });
          setError(
            `Details saved, but the documents weren't uploaded: ${
              firstFieldError(docErr, documentFields) || docErr.detail || 'the upload failed.'
            } Choose the files again and save to retry.`
          );
          return;
        }
      }
      onSaved(updated);
    } catch (err) {
      setError(firstFieldError(err, fields) || err.detail || 'Could not save changes. Check the fields and try again.');
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

        {documentFields.length > 0 && (
          <div style={{ margin: '6px 0 16px' }}>
            <div style={{ ...labelStyle, fontSize: 12.5, color: COLORS.ink }}>Onboarding documents</div>
            <p style={{ fontSize: 11.5, color: COLORS.inkMuted, margin: '0 0 10px' }}>
              Upload a document to add one that&apos;s missing, or to replace an expired copy. Leave blank to keep what&apos;s on file.
            </p>
            {documentFields.map((d) => (
              <div key={d.name} style={{ marginBottom: 12 }}>
                <label style={labelStyle}>
                  {d.label} —{' '}
                  {user[d.urlField] ? (
                    <a href={user[d.urlField]} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.accent }}>
                      view current
                    </a>
                  ) : (
                    <span style={{ color: COLORS.red }}>not on file</span>
                  )}
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setFiles((s) => ({ ...s, [d.name]: e.target.files[0] || null }))}
                  style={{ ...inputStyle, padding: '8px 10px' }}
                />
              </div>
            ))}
          </div>
        )}

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

  // POST /auth/admin/users/{id}/trigger-password-reset/ — backend already
  // returns {"detail": "Password reset email sent to <email>."} verbatim,
  // so surfacing response.detail directly (same convention handleDeactivate/
  // handleReactivate already use for a noteworthy result) is the whole
  // "clear success message" requirement, no message built client-side.
  const handleTriggerPasswordReset = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await apiCall(ENDPOINTS.triggerPasswordReset(user.id), 'POST');
      window.alert(response.detail);
    } catch (err) {
      setError(err.detail || 'Could not send the password reset email.');
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
            <button
              type="button"
              style={menuItemStyle}
              disabled={busy}
              onClick={() => { setOpen(false); handleTriggerPasswordReset(); }}
            >
              {busy ? 'Sending…' : 'Reset Password'}
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
          onSaved={(updated, opts) => {
            onChanged(updated);
            if (!opts?.keepOpen) setEditing(false);
          }}
        />
      )}
    </>
  );
}

const menuBtnStyle = { background: 'none', border: 'none', color: COLORS.ink, fontSize: 18, fontWeight: 700, cursor: 'pointer', padding: '2px 10px', borderRadius: 6, lineHeight: 1 };
const menuDropdownStyle = { position: 'absolute', right: 0, top: '100%', marginTop: 4, background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 20, minWidth: 150, overflow: 'hidden' };
const menuItemStyle = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: COLORS.ink, fontSize: 12.5, fontWeight: 600, padding: '10px 14px', cursor: 'pointer' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(2,28,57,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' };
// maxHeight + overflowY so a tall form scrolls internally instead of
// overflowing the fixed-position overlay with no way to reach the rest of
// it — see App.css's .modal-panel for the same fix applied to the other
// modal style in this codebase (kept consistent, same values).
const panelStyle = { background: COLORS.panel, borderRadius: 14, padding: 28, width: 420, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 8px 30px rgba(0,0,0,0.55)' };
const closeBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${COLORS.border}`, background: '#0F0F1A', color: COLORS.ink, fontSize: 13, boxSizing: 'border-box' };
const actionBtnStyle = { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
