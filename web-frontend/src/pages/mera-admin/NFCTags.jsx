import { useState, useEffect, useCallback } from 'react';
import { apiCall, ENDPOINTS } from '../../services/api';
import StatusBadge from '../../components/StatusBadge';
import CopyButton from '../../components/CopyButton';

// Same self-contained-COLORS approach as Institutions.jsx/Users.jsx — this
// is another MERA admin (platform-owner) page.
const COLORS = {
  ink: '#FFFFFF',
  inkMuted: '#A0A0B0',
  inkFaint: '#7D7D93',
  panel: '#404259',
  border: '#5a5c73',
  accent: 'var(--mera-accent)',
  red: '#f28b8b',
  selectedBg: 'rgba(61,133,255,0.18)',
};
const SHADOW = {
  card: '0 1px 3px rgba(0,0,0,0.4)',
  modal: '0 8px 30px rgba(0,0,0,0.55)',
};

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Generate a batch of N unpaired tags — returns short codes + full URLs so
// the admin can note/print them before writing each one to a physical NFC
// sticker (that writing step happens outside this app, with a free NFC-
// writing app — not this codebase's concern; see PROJECT_CONTEXT.md).
function GenerateBatchModal({ onClose, onGenerated }) {
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [generated, setGenerated] = useState(null); // null = form still showing, array = results

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const rows = await apiCall(ENDPOINTS.nfcTagsGenerate, 'POST', { count: Number(count) });
      setGenerated(rows);
      onGenerated();
    } catch (err) {
      setError(err.detail || err.count?.[0] || 'Could not generate tags.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...panelStyle, width: 640 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
            {generated ? `${generated.length} tags generated` : 'Generate NFC tags'}
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        {!generated && (
          <form onSubmit={submit}>
            <p style={{ fontSize: 12.5, color: COLORS.inkFaint, margin: '0 0 14px', lineHeight: 1.5 }}>
              Creates unpaired tags ready for pairing once physical stickers are written and sold.
              Each one gets a unique short code and public URL.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>How many?</label>
              <input
                type="number"
                min={1}
                max={200}
                required
                value={count}
                onChange={(e) => setCount(e.target.value)}
                style={inputStyle}
              />
            </div>
            {error && <p style={{ color: COLORS.red, fontSize: 12.5, margin: '0 0 12px' }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ ...actionBtnStyle, background: COLORS.accent, opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Generating…' : 'Generate batch'}
            </button>
          </form>
        )}

        {generated && (
          <>
            <p style={{ fontSize: 12.5, color: COLORS.inkFaint, margin: '0 0 14px', lineHeight: 1.5 }}>
              Note or print these before writing each URL to a physical NFC sticker. You can also
              find them again later in the tag list — each row there has its own Copy button.
            </p>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8, marginBottom: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, padding: '8px 12px' }}>Short code</th>
                    <th style={{ ...thStyle, padding: '8px 12px' }}>URL</th>
                    <th style={{ ...thStyle, padding: '8px 12px' }} />
                  </tr>
                </thead>
                <tbody>
                  {generated.map((t) => (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ ...tdStyle, padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{t.short_code}</td>
                      <td style={{ ...tdStyle, padding: '8px 12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{t.url}</td>
                      <td style={{ ...tdStyle, padding: '8px 12px' }}>
                        <CopyButton text={t.url} label="Copy URL" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <CopyButton
                text={generated.map((t) => `${t.short_code}\t${t.url}`).join('\n')}
                label="Copy all (code + URL)"
                style={{ flex: 1, padding: '12px 0', fontSize: 13, borderRadius: 8 }}
              />
              <button type="button" onClick={onClose} style={{ ...actionBtnStyle, flex: 1, background: COLORS.accent }}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Pair a specific physical tag (identified by its short code — read off
// the sticker the admin is physically holding) to a patient's account.
//
// Patient search/select: pulls the platform user list (GET /auth/admin/users/
// ?search=, which has no server-side role filter) and filters client-side to
// role === 'patient', same approach as Institutions.jsx's reassignment picker.
//
// BUG FIXED HERE — "click the filtered patient, click Pair, get 'no patient
// selected'": this used to be a native <select size={n}> whose value was
// selectedPatientId (initially ''). When the search narrowed to ONE result,
// size={1} makes the browser render a one-line dropdown that *displays* its
// only option as selected while React's state was still '' — clicking that
// already-displayed option fires no change event, so state never updated and
// Pair's validation (which reads that state) rejected it. (With more results
// the same controlled-select value/selection mismatch made it flaky too.)
// Replaced with an explicit click-to-select list: each row's onClick sets
// `selectedPatient` (the whole patient object — not an index into a list
// that changes as you type), the checkbox/highlight are rendered FROM that
// same state, and validation reads that same state — so what you see
// selected is, by construction, what Pair submits. The selection also
// survives further searching (it's pinned in a "Selected" line even if the
// patient drops out of the current results).
function PairTagModal({ onClose, onPaired }) {
  const [shortCode, setShortCode] = useState('');
  const [patientSearchInput, setPatientSearchInput] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setPatientSearch(patientSearchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [patientSearchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPatients(true);
    const qs = patientSearch ? `?search=${encodeURIComponent(patientSearch)}` : '';
    apiCall(`${ENDPOINTS.users}${qs}`)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.results || [];
        setPatients(list.filter((u) => u.role === 'patient'));
      })
      .catch(() => {
        if (!cancelled) setPatients([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPatients(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientSearch]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!selectedPatient) {
      setError('Select which patient this tag belongs to.');
      return;
    }
    setBusy(true);
    try {
      await apiCall(ENDPOINTS.nfcTagsPair, 'POST', {
        short_code: shortCode.trim(),
        patient_id: selectedPatient.id,
      });
      onPaired();
    } catch (err) {
      setError(err.detail || err.short_code || err.patient_id || 'Could not pair that tag.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={{ ...panelStyle, width: 680, maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>Pair a tag to a patient</h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Short code (from the physical sticker)</label>
          <input
            type="text"
            required
            placeholder="e.g. 7HJK4RXM"
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Patient</label>
          <input
            type="text"
            placeholder="Search patients by name or email…"
            value={patientSearchInput}
            onChange={(e) => setPatientSearchInput(e.target.value)}
            style={{ ...inputStyle, marginBottom: 10 }}
          />

          {selectedPatient && (
            <div style={selectedChipStyle}>
              <span>
                <strong>Selected:</strong> {selectedPatient.display_name || selectedPatient.email}{' '}
                <span style={{ color: COLORS.inkMuted }}>({selectedPatient.email})</span>
              </span>
              <button type="button" onClick={() => setSelectedPatient(null)} style={clearBtnStyle}>Clear</button>
            </div>
          )}

          <div style={listBoxStyle} role="listbox" aria-label="Patients">
            {loadingPatients ? (
              <p style={{ ...mutedText, padding: 14 }}>Loading…</p>
            ) : patients.length === 0 ? (
              <p style={{ ...mutedText, padding: 14 }}>No matching patients.</p>
            ) : (
              patients.map((p) => {
                const isSelected = selectedPatient?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelectedPatient(p)}
                    style={{
                      ...patientRowStyle,
                      background: isSelected ? COLORS.selectedBg : 'transparent',
                      borderColor: isSelected ? COLORS.accent : 'transparent',
                    }}
                  >
                    {/* Visible selected-state indicator — permanent affordance so it's
                        obvious a click registered. Rendered from the same
                        selectedPatient state that Pair validates. */}
                    <span style={{ ...checkboxStyle, background: isSelected ? COLORS.accent : 'transparent', borderColor: isSelected ? COLORS.accent : COLORS.inkMuted }}>
                      {isSelected ? '✓' : ''}
                    </span>
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 600, color: COLORS.ink, fontSize: 13.5 }}>
                        {p.display_name || p.email}
                      </span>
                      <span style={{ display: 'block', color: COLORS.inkMuted, fontSize: 12 }}>{p.email}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {error && <p style={{ color: COLORS.red, fontSize: 12.5, margin: '0 0 12px' }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ ...actionBtnStyle, background: COLORS.accent, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Pairing…' : 'Pair tag'}
        </button>
      </form>
    </div>
  );
}

export default function NFCTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'paired' | 'unpaired' | 'voided'
  const [showGenerate, setShowGenerate] = useState(false);
  const [showPair, setShowPair] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs =
      filter === 'all' ? '' : filter === 'voided' ? '?voided=true' : `?paired=${filter === 'paired'}`;
    apiCall(`${ENDPOINTS.nfcTags}${qs}`)
      .then((data) => setTags(Array.isArray(data) ? data : data.results || []))
      .catch((e) => setError(e.detail || 'Could not load NFC tags.'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Unpair / void — both confirm first, then hit their own endpoint.
  const runAction = async (tag, endpoint, confirmText) => {
    if (!window.confirm(confirmText)) return;
    setActionError(null);
    setBusyId(tag.id);
    try {
      await apiCall(endpoint, 'POST');
      load();
    } catch (err) {
      setActionError(err.detail || `Could not update tag ${tag.short_code}.`);
    } finally {
      setBusyId(null);
    }
  };

  const unpair = (t) =>
    runAction(
      t,
      ENDPOINTS.nfcTagUnpair(t.id),
      `Unpair tag ${t.short_code} from ${t.patient_display_name || 'this patient'}?\n\n` +
        'The tag itself stays valid — the same physical sticker can be paired to a different patient afterwards.'
    );

  const voidTag = (t) =>
    runAction(
      t,
      ENDPOINTS.nfcTagVoid(t.id),
      `Void tag ${t.short_code}? This is PERMANENT.\n\n` +
        'Use it for a lost, damaged or compromised sticker: its URL stops working immediately (the public page will show "not recognized") and it can never be paired or reused. ' +
        'To just move the sticker to another patient, use Unpair instead.'
    );

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', color: COLORS.ink, fontSize: '1.4rem' }}>NFC Tags</h1>
          <p style={{ margin: 0, color: COLORS.inkMuted, fontSize: '0.85rem' }}>
            Physical emergency tags — generate inventory, then pair a tag to a patient once it's sold.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowPair(true)} style={{ ...createBtnStyle, background: 'transparent', border: `1px solid ${COLORS.border}`, color: COLORS.ink }}>
            Pair a tag
          </button>
          <button onClick={() => setShowGenerate(true)} style={createBtnStyle}>+ Generate batch</button>
        </div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'paired', label: 'Paired' },
          { key: 'unpaired', label: 'Unpaired' },
          { key: 'voided', label: 'Voided' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              ...filterBtnStyle,
              background: filter === f.key ? COLORS.accent : 'transparent',
              color: filter === f.key ? '#fff' : COLORS.inkMuted,
              borderColor: filter === f.key ? COLORS.accent : COLORS.border,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {actionError && <p style={{ color: COLORS.red, fontSize: 13, margin: '0 0 12px' }}>{actionError}</p>}

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: 'auto', boxShadow: SHADOW.card }}>
        {loading && <p style={{ padding: 28, ...mutedText }}>Loading…</p>}
        {error && <p style={{ padding: 28, ...mutedText, color: COLORS.red }}>{error}</p>}
        {!loading && !error && tags.length === 0 && (
          <p style={{ padding: 28, ...mutedText }}>
            {filter === 'all' ? 'No tags yet — generate the first batch above.' : `No ${filter} tags.`}
          </p>
        )}
        {!loading && !error && tags.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Short code', 'Status', 'Patient', 'Tag URL', 'Paired', 'Created', 'Actions'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => {
                const voided = t.status === 'voided';
                return (
                  <tr key={t.id} className="mera-row" style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: voided ? 0.6 : 1 }}>
                    <td style={{ ...tdStyle, fontWeight: 700, fontFamily: 'monospace' }}>{t.short_code}</td>
                    <td style={tdStyle}><StatusBadge status={t.status} /></td>
                    <td style={{ ...tdStyle, fontSize: 12.5 }}>
                      {t.patient ? `${t.patient_display_name || '—'} (${t.patient_email || '—'})` : '—'}
                    </td>
                    <td style={tdStyle}>
                      {voided ? (
                        <span style={{ color: COLORS.inkFaint, fontSize: 12 }}>Disabled</span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <CopyButton text={t.url} label="Copy URL" />
                          <a href={t.url} target="_blank" rel="noopener noreferrer" style={openLinkStyle}>Open</a>
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12.5, color: COLORS.inkMuted }}>{formatWhen(t.paired_at)}</td>
                    <td style={{ ...tdStyle, fontSize: 12.5, color: COLORS.inkMuted }}>{formatWhen(t.created_at)}</td>
                    <td style={tdStyle}>
                      {voided ? (
                        <span style={{ color: COLORS.inkFaint, fontSize: 12 }}>Voided {formatWhen(t.voided_at)}</span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          {t.status === 'paired' && (
                            <button type="button" disabled={busyId === t.id} onClick={() => unpair(t)} style={rowBtnStyle}>
                              Unpair
                            </button>
                          )}
                          <button type="button" disabled={busyId === t.id} onClick={() => voidTag(t)} style={{ ...rowBtnStyle, color: COLORS.red, borderColor: COLORS.red }}>
                            Void
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showGenerate && (
        <GenerateBatchModal
          onClose={() => { setShowGenerate(false); load(); }}
          onGenerated={load}
        />
      )}
      {showPair && (
        <PairTagModal
          onClose={() => setShowPair(false)}
          onPaired={() => { setShowPair(false); load(); }}
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
const filterBtnStyle = { padding: '7px 16px', borderRadius: 20, border: '1px solid', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const rowBtnStyle = { background: 'transparent', border: `1px solid ${COLORS.border}`, color: COLORS.ink, borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' };
const openLinkStyle = { color: COLORS.accent, fontSize: 11.5, fontWeight: 600, textDecoration: 'none' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(2,28,57,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' };
const panelStyle = { background: COLORS.panel, borderRadius: 14, padding: 28, width: 460, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', boxShadow: SHADOW.modal };
const closeBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${COLORS.border}`, background: '#0F0F1A', color: COLORS.ink, fontSize: 13, boxSizing: 'border-box' };
const actionBtnStyle = { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const listBoxStyle = { maxHeight: 300, minHeight: 120, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 8, background: '#0F0F1A', padding: 6 };
const patientRowStyle = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', marginBottom: 4, font: 'inherit' };
const checkboxStyle = { width: 20, height: 20, borderRadius: 5, border: '2px solid', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 };
const selectedChipStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: COLORS.selectedBg, border: `1px solid ${COLORS.accent}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12.5, color: COLORS.ink };
const clearBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' };
