import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/mera-logo.png';

const NAV = [
  { to: '/mera-admin', label: 'Dashboard', end: true },
  { to: '/mera-admin/institutions', label: 'Institutions' },
  { to: '/mera-admin/users', label: 'Users' },
];

export default function MeraAdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#0F0F1A' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 28px',
          background: '#404259',
          borderBottom: '1px solid #5a5c73',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src={logo} alt="MERA" style={{ height: 28, width: 28, objectFit: 'contain' }} />
          <span style={{ color: '#FFFFFF', fontWeight: 700, letterSpacing: 1 }}>MERA</span>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                color: isActive ? 'var(--mera-accent)' : '#A0A0B0',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {user && (
            <span style={{ color: '#A0A0B0', fontSize: 13 }}>
              {user.display_name || user.email}
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            style={{
              background: 'transparent',
              border: '1px solid #5a5c73',
              color: '#FFFFFF',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
