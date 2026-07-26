import React, { useState, useEffect, useCallback } from 'react';
import { apiCall, ENDPOINTS } from '../../services/api';
import DashboardShell from '../../components/DashboardShell';
import StatusBadge from '../../components/StatusBadge';
import { COLORS, SHADOW } from '../../lib/theme';

const TABS = [
  { key: 'queue', label: 'Pending queue', endpoint: ENDPOINTS.verification.queue },
  { key: 'approved', label: 'Approved', endpoint: ENDPOINTS.verification.approved },
  { key: 'flagged', label: 'Flagged', endpoint: ENDPOINTS.verification.flagged },
];

function timeAgo(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ReviewPanel({ requestId, onClose, onActioned }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    apiCall(ENDPOINTS.verification.review(requestId))
      .then(setProfile)
      .catch((e) => setError(e.detail || 'Could not load patient profile.'))
      .finally(() => setLoading(false));
  }, [requestId]);

  const sendAction = async (action, withNote = '') => {
    setBusy(true);
    try {
      await apiCall(ENDPOINTS.verification.action(requestId), 'POST', { action, note: withNote });
      onActioned();
    } catch (e) {
      setError(e.detail || "Couldn't record that action.");
    } finally {
      setBusy(false);
      setNoteFor(null);
      setNote('');
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
            Patient medical profile
          </h2>
          <button onClick={onClose} style={closeBtnStyle}>Close</button>
        </div>

        {loading && <p style={mutedText}>Loading…</p>}
        {error && <p style={{ ...mutedText, color: COLORS.red }}>{error}</p>}

        {profile && !loading && (
          <div style={{ marginBottom: 22, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {Object.entries(profile).map(([key, value], i) => (
              <div key={key} style={{ ...detailRow, background: i % 2 === 0 ? '#FAFBFC' : '#fff' }}>
                <span style={{ fontSize: 12, color: COLORS.inkMuted, textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, textAlign: 'right', maxWidth: '58%' }}>
                  {value === null || value === '' ? '—' : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {noteFor ? (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, display: 'block', marginBottom: 7 }}>
              Note (required for {noteFor === 'flag' ? 'flagging' : 'requesting more info'})
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              style={textareaStyle}
              placeholder="Explain why…"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                disabled={busy || !note.trim()}
                onClick={() => sendAction(noteFor, note)}
                style={{ ...actionBtnStyle, background: COLORS.navy, opacity: !note.trim() ? 0.5 : 1 }}
              >
                {busy ? 'Submitting…' : 'Submit'}
              </button>
              <button
                onClick={() => setNoteFor(null)}
                style={{ ...actionBtnStyle, background: '#fff', color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy} onClick={() => sendAction('approve')} style={{ ...actionBtnStyle, background: COLORS.success }}>
              Approve
            </button>
            <button disabled={busy} onClick={() => setNoteFor('flag')} style={{ ...actionBtnStyle, background: COLORS.red }}>
              Flag
            </button>
            <button disabled={busy} onClick={() => setNoteFor('request_info')} style={{ ...actionBtnStyle, background: COLORS.amber }}>
              Request info
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerificationQueue() {
  const [tab, setTab] = useState('queue');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const endpoint = TABS.find((t) => t.key === tab).endpoint;
    apiCall(endpoint)
      .then(setRows)
      .catch((e) => setError(e.detail || 'Could not load the verification queue.'))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <DashboardShell title="Patient Verification" subtitle="Review and approve patient medical profiles">
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '9px 18px', borderRadius: 22, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${tab === t.key ? COLORS.navy : COLORS.border}`,
              background: tab === t.key ? COLORS.navy : '#fff',
              color: tab === t.key ? '#fff' : COLORS.inkMuted,
              transition: 'all 0.15s ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: SHADOW.card }}>
        {loading && <p style={{ padding: 28, ...mutedText }}>Loading…</p>}
        {error && <p style={{ padding: 28, ...mutedText, color: COLORS.red }}>{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p style={{ padding: 28, ...mutedText }}>Nothing here right now.</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Patient', 'Urgency', 'Status', 'Submitted', ''].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="mera-row" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.patient_name || '—'}</td>
                  <td style={tdStyle}>{r.urgency_badge || '—'}</td>
                  <td style={tdStyle}><StatusBadge status={r.status} /></td>
                  <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.inkMuted }}>
                    {timeAgo(r.hours_since_submission)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button onClick={() => setSelectedId(r.id)} style={reviewBtnStyle}>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <ReviewPanel
          requestId={selectedId}
          onClose={() => setSelectedId(null)}
          onActioned={() => { setSelectedId(null); load(); }}
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
const reviewBtnStyle = { padding: '7px 16px', borderRadius: 7, border: `1px solid ${COLORS.navy}`, background: '#fff', color: COLORS.navy, fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(2,28,57,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' };
const panelStyle = { background: '#fff', borderRadius: 14, padding: 28, width: 500, maxHeight: '82vh', overflowY: 'auto', boxShadow: SHADOW.modal };
const closeBtnStyle = { background: 'none', border: 'none', color: COLORS.inkMuted, fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const detailRow = { display: 'flex', justifyContent: 'space-between', padding: '10px 14px' };
const actionBtnStyle = { flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'opacity 0.15s ease' };
const textareaStyle = { width: '100%', padding: 11, borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' };
