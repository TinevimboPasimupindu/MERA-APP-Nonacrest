import { COLORS } from '../lib/theme';
import FontLoader from './FontLoader';

function GridTexture() {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.07 }}>
      <defs>
        <pattern id="mera-grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#fff" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#mera-grid)" />
    </svg>
  );
}

export default function DashboardShell({ title, subtitle, actions, children }) {
  return (
    <div style={{ minHeight: '100vh', background: COLORS.canvas, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <FontLoader />
      <header
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '26px 34px',
          background: COLORS.navy,
          color: '#fff',
        }}
      >
        <GridTexture />
        <div style={{ position: 'relative' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: '5px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{subtitle}</p>
          )}
        </div>
        {actions && <div style={{ position: 'relative' }}>{actions}</div>}
      </header>
      <main style={{ padding: 34, maxWidth: 1180, margin: '0 auto' }}>{children}</main>
    </div>
  );
}

