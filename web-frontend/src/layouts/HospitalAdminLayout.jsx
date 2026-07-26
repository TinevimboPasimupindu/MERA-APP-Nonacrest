import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PulseLine from '../components/PulseLine';

const NAV = [
  { to: '/hospital-admin', label: 'Dashboard', end: true },
  { to: '/hospital-admin/verification-queue', label: 'Verification queue' },
  { to: '/hospital-admin/incoming', label: 'Incoming ambulances' },
];

export default function HospitalAdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span className="brand-mark">MERA</span>
          <span className="brand-sub">Hospital Admin</span>
        </div>

        <nav className="admin-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <PulseLine className="admin-pulse" />
          {user && (
            <div className="admin-user">
              <div className="admin-user-name">{user.full_name || user.email}</div>
              <div className="admin-user-org">{user.hospital_name || 'Hospital Admin'}</div>
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
