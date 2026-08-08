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
  inkFaint: '#7D7D93',
  panel: '#404259',
  border: '#5a5c73',
  accent: 'var(--mera-accent)',
  red: '#f28b8b',
};
const SHADOW = {
  card: '0 1px 3px rgba(0,0,0,0.4)',
  modal: '0 8px 30px rgba(0,0,0,0.55)',
};

// Role naming is mid-migration platform-wide (see PROJECT_CONTEXT.md,
// "Role naming" section) — old and new role values are both still live.
// Labelled explicitly here rather than hidden, since knowing whether an
// institution is on the old or new role scheme is operationally relevant
// for a MERA admin.
const ROLE_LABELS = {
  hospital: 'Hospital (legacy)',
  hospital_admin: 'Hospital Admin',
  ambulance_service: 'Ambulance (legacy)',
  ambulance_admin: 'Ambulance Admin',
};

// Matches backend/accounts/models.py HOSPITAL_ROLES/AMBULANCE_ROLES — used
// to filter the reassignment dropdown to the correct institution type.
const ROLE_GROUPS = {
  hospital: new Set(['hospital', 'hospital_admin']),
  ambulance: new Set(['ambulance_service', 'ambulance_admin']),
};

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Shared field set for both creation modals — differs only in the "name"
// field (facility_name vs service_name, which feeds get_display_name() on
// the backend) and which endpoint it posts to. Only email/password/
// confirm_password are actually required by the backend serializers (every
// other model field is blank=True) — admin_contact_name/admin_phone are
// included here because they're the fields a MERA admin would realistically
// want to capture at onboarding time, not because the backend requires them.
function buildFields(nameField, nameLabel) {
  return [
    { name: nameField, label: nameLabel, type: 'text' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'admin_contact_name', label: 'Admin contact name', type: 'text' },
    { name: 'admin_phone', label: 'Admin phone', type: 'text' },
    { name: 'password', label: 'Password', type: 'password' },
    { name: 'confirm_password', label: 'Confirm password', type: 'password' },
  ];
}

const HOSPITAL_FIELDS = buildFields('facility_name', 'Facility name');
const AMBULANCE_FIELDS = buildFields('service_name', 'Service name');

function CreateInstitutionModal({ title, fields, endpoint, roleGroup, onClose, onCreated }) {
  const [form, setForm] = useState(Object.fromEntries(fields.map((f) => [f.name, ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Reassignment ("successor_of") — take over an existing deactivated
  // institution instead of starting from a blank one. The institutions list
  // endpoint doesn't expose is_active (only institutional_status, a
  // different field), so this pulls from the full platform user list
  // instead, which does — filtered client-side to this modal's role group
  // and is_active === false.
  const [reassign, setReassign] = useState(false);
  const [successorOf, setSuccessorOf] = useState('');
  const [deactivatedOptions, setDeactivatedOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (!reassign) return;
    let cancelled = false;
    setLoadingOptions(true);
    apiCall(ENDPOINTS.users)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.results || [];
        setDeactivatedOptions(
          list.filter((u) => u.is_active === false && ROLE_GROUPS[roleGroup].has(u.role))
        );
      })
      .catch(() => {
        if (!cancelled) setDeactivatedOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reassign, roleGroup]);

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
    if (reassign && !successorOf) {
      setError('Select which deactivated institution this account is taking over.');
      return;
    }

    setBusy(true);
    try {
      const payload = reassign ? { ...form, successor_of: successorOf } : form;
      await apiCall(endpoint, 'POST', payload);
      onCreated();
    } catch (err) {
      setError(
        err.detail || err.email?.[0] || err.successor_of?.[0] ||
        'Could not create that account. Check the fields and try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={panelStyle} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>{title}</h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        {fields.map((f) => (
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

        <div style={{ marginBottom: 14, paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={reassign}
              onChange={(e) => {
                setReassign(e.target.checked);
                setSuccessorOf('');
              }}
            />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
              Reassign to existing institution
            </span>
          </label>
          <p style={{ fontSize: 11.5, color: COLORS.inkFaint, margin: '6px 0 0', lineHeight: 1.5 }}>
            Use this when a previous admin's account was deactivated but the
            physical institution is still operating. Selecting one transfers
            its name and details onto this new account{roleGroup === 'ambulance'
              ? ' and automatically reactivates any EMTs that were deactivated along with it'
              : ''} — the old account itself stays deactivated for the historical record.
          </p>

          {reassign && (
            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>Deactivated institution</label>
              {loadingOptions ? (
                <p style={{ fontSize: 12.5, color: COLORS.inkMuted, margin: 0 }}>Loading…</p>
              ) : deactivatedOptions.length === 0 ? (
                <p style={{ fontSize: 12.5, color: COLORS.inkMuted, margin: 0 }}>
                  No deactivated institutions of this type found.
                </p>
              ) : (
                <select
                  required
                  value={successorOf}
                  onChange={(e) => setSuccessorOf(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select…</option>
                  {deactivatedOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.display_name} ({opt.email})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {error && <p style={{ color: COLORS.red, fontSize: 12.5, margin: '0 0 12px' }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ ...actionBtnStyle, background: COLORS.accent, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Creating…' : reassign ? 'Create and reassign' : 'Create account'}
        </button>
        <p style={{ fontSize: 11.5, color: COLORS.inkFaint, marginTop: 12, lineHeight: 1.5 }}>
          Share this password with the institution's admin directly — there's
          no invite-email flow yet, so this is how they'll sign in for the
          first time. The account is created active immediately, no approval
          step needed.
        </p>
      </form>
    </div>
  );
}

export default function Institutions() {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(null); // null | 'hospital' | 'ambulance'
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
    apiCall(`${ENDPOINTS.institutions}${qs}`)
      .then((data) => setInstitutions(Array.isArray(data) ? data : data.results || []))
      .catch((e) => setError(e.detail || 'Could not load institutions.'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const patchInstitution = (id, patch) => {
    setInstitutions((prev) => prev.map((inst) => (inst.id === id ? { ...inst, ...patch } : inst)));
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', color: COLORS.ink, fontSize: '1.4rem' }}>Institutions</h1>
          <p style={{ margin: 0, color: COLORS.inkMuted, fontSize: '0.85rem' }}>
            Hospital and ambulance admin accounts across the platform.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowCreate('hospital')} style={createBtnStyle}>+ Hospital Admin</button>
          <button onClick={() => setShowCreate('ambulance')} style={createBtnStyle}>+ Ambulance Admin</button>
        </div>
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
        {!loading && !error && institutions.length === 0 && (
          <p style={{ padding: 28, ...mutedText }}>
            {search ? 'No institutions match that search.' : 'No institutions onboarded yet — create the first one above.'}
          </p>
        )}
        {!loading && !error && institutions.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Name', 'Type', 'Email', 'Status', 'Joined', 'Actions'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr key={inst.id} className="mera-row" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{inst.display_name || '—'}</td>
                  <td style={tdStyle}>{ROLE_LABELS[inst.role] || inst.role}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{inst.email || '—'}</td>
                  {/* is_active, not institutional_status — deactivate/reactivate only ever
                      touch is_active. institutional_status (approved/pending/rejected) is a
                      separate concept (MERA's approval of the institution's registration
                      paperwork) that's currently hardcoded to "approved" for every account
                      in this prototype (see "Prototype safety bypasses" #1 in
                      PROJECT_CONTEXT.md) — showing it here would just be an identical badge
                      on every row. Revisit adding it back once that bypass is reinstated
                      and institutional_status can actually vary again. */}
                  <td style={tdStyle}><StatusBadge status={inst.is_active === false ? 'inactive' : 'active'} /></td>
                  <td style={{ ...tdStyle, fontSize: 12.5, color: COLORS.inkMuted }}>{formatWhen(inst.date_joined)}</td>
                  <td style={tdStyle}>
                    <UserRowActions user={inst} onChanged={(patch) => patchInstitution(inst.id, patch)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate === 'hospital' && (
        <CreateInstitutionModal
          title="Create Hospital Admin account"
          fields={HOSPITAL_FIELDS}
          endpoint={ENDPOINTS.createHospitalAdmin}
          roleGroup="hospital"
          onClose={() => setShowCreate(null)}
          onCreated={() => { setShowCreate(null); load(); }}
        />
      )}
      {showCreate === 'ambulance' && (
        <CreateInstitutionModal
          title="Create Ambulance Admin account"
          fields={AMBULANCE_FIELDS}
          endpoint={ENDPOINTS.createAmbulanceAdmin}
          roleGroup="ambulance"
          onClose={() => setShowCreate(null)}
          onCreated={() => { setShowCreate(null); load(); }}
        />
      )}

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
const createBtnStyle = { padding: '10px 18px', borderRadius: 8, border: 'none', background: COLORS.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(2,28,57,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' };
const panelStyle = { background: COLORS.panel, borderRadius: 14, padding: 28, width: 420, boxShadow: SHADOW.modal };
const closeBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${COLORS.border}`, background: '#0F0F1A', color: COLORS.ink, fontSize: 13, boxSizing: 'border-box' };
const actionBtnStyle = { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
