import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall, ENDPOINTS, saveToken } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/mera-logo.png';
import bgImage from '../../assets/ambulance-intro.png';

const ROLES = [
  { value: 'mera_admin', label: 'MERA Admin' },
  { value: 'hospital_admin', label: 'Hospital Admin' },
  { value: 'ambulance_admin', label: 'Ambulance Admin' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('mera_admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiCall(
        ENDPOINTS.login,
        'POST',
        { email, password },
        false
      );

      if (response.user.role !== role) {
        setError(`This account is not registered as ${ROLES.find(r => r.value === role)?.label}.`);
        setLoading(false);
        return;
      }

      saveToken(response.access, response.refresh);
      login(response.user);

      if (response.user.role === 'hospital_admin') {
        navigate('/hospital-admin', { replace: true });
      } else if (response.user.role === 'ambulance_admin') {
        navigate('/ambulance-admin', { replace: true });
      } else {
        setError('MERA Admin dashboard isn’t built yet — logged in, but there’s nowhere to go.');
      }

    } catch (err) {
      setError(err.detail || 'Login failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (

    <div className="login-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="login-header">
        <img src={logo} alt="MERA" className="login-logo" />
        <div className="login-divider" />
        <h1>MERA</h1>
        <p className="app-subtitle">Medical Emergency Response App</p>
        <div className="login-divider" />
      </div>

      <div className="login-card">
        <p className="portal-label">Staff and admin portal</p>

        <div className="role-selector">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`role-tab ${role === r.value ? 'active' : ''}`}
              onClick={() => setRole(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="name@hospital.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}