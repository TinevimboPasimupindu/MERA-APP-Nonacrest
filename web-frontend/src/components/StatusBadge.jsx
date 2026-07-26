import { COLORS } from '../lib/theme';

const STATUS_STYLES = {
  pending: { color: COLORS.amber, bg: COLORS.amberSoft, label: 'Pending', live: true },
  info_requested: { color: COLORS.info, bg: COLORS.infoSoft, label: 'Info requested', live: true },
  approved: { color: COLORS.success, bg: COLORS.successSoft, label: 'Approved', live: false },
  rejected: { color: COLORS.red, bg: COLORS.redSoft, label: 'Rejected', live: false },
  flagged: { color: COLORS.red, bg: COLORS.redSoft, label: 'Flagged', live: false },
  withdrawn: { color: COLORS.inkFaint, bg: '#EEF0F3', label: 'Withdrawn', live: false },
  active: { color: COLORS.success, bg: COLORS.successSoft, label: 'Active', live: false },
  inactive: { color: COLORS.inkFaint, bg: '#EEF0F3', label: 'Inactive', live: false },
};

export default function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { color: COLORS.inkMuted, bg: '#EEF0F3', label: status, live: false };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        padding: '4px 10px',
        borderRadius: 20,
        color: s.color,
        background: s.bg,
      }}
    >
      {s.live && (
        <span style={{ position: 'relative', width: 6, height: 6 }}>
          <span
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: s.color,
              animation: 'mera-pulse 1.6s ease-out infinite',
            }}
          />
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: s.color }} />
        </span>
      )}
      {s.label}
      <style>{`@keyframes mera-pulse { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }`}</style>
    </span>
  );
}
