// Dark-theme colors — this component is currently only used by
// ambulance-admin's EmtManagement.jsx, so its accent ('info') matches
// Colors.ambulance (#F2731A) from the mobile app's constants/theme.ts.
const COLORS = {
  amber: '#f2c078',
  amberSoft: 'rgba(242,192,120,0.15)',
  info: '#F2731A',
  infoSoft: 'rgba(242,115,26,0.15)',
  success: '#6fcf97',
  successSoft: 'rgba(111,207,151,0.15)',
  red: '#f28b8b',
  redSoft: 'rgba(242,139,139,0.15)',
  inkFaint: '#7D7D93',
  inkMuted: '#A0A0B0',
};

const STATUS_STYLES = {
  pending: { color: COLORS.amber, bg: COLORS.amberSoft, label: 'Pending', live: true },
  info_requested: { color: COLORS.info, bg: COLORS.infoSoft, label: 'Info requested', live: true },
  approved: { color: COLORS.success, bg: COLORS.successSoft, label: 'Approved', live: false },
  rejected: { color: COLORS.red, bg: COLORS.redSoft, label: 'Rejected', live: false },
  flagged: { color: COLORS.red, bg: COLORS.redSoft, label: 'Flagged', live: false },
  withdrawn: { color: COLORS.inkFaint, bg: 'rgba(125,125,147,0.15)', label: 'Withdrawn', live: false },
  active: { color: COLORS.success, bg: COLORS.successSoft, label: 'Active', live: false },
  inactive: { color: COLORS.inkFaint, bg: 'rgba(125,125,147,0.15)', label: 'Inactive', live: false },
};

export default function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { color: COLORS.inkMuted, bg: 'rgba(160,160,176,0.15)', label: status, live: false };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
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
