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

// Self-service password reset (POST /auth/password-reset/) — same generic
// "a reset link has been sent" message shown
// regardless of outcome, matching the backend's own anti-enumeration
// contract exactly: this modal doesn't (and can't) know whether the email
// it just submitted matched a real account, or whether delivery even
// succeeded, and showing anything more specific than the generic message
// would just re-introduce client-side what the backend deliberately
// doesn't reveal server-side.
function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiCall(ENDPOINTS.passwordResetRequest, 'POST', { email }, false);
    } catch {
      // Deliberately ignored — the backend already returns this exact same
      // response whether the account exists, doesn't, or delivery failed
      // (see PROJECT_CONTEXT.md), so a caught error here has nothing more
      // specific to say than the generic message shown either way.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel card" onClick={(e) => e.stopPropagation()}>
        <h2>Reset your password</h2>
        {submitted ? (
          <>
            <p className="modal-body">
              A password reset link has been sent.
            </p>
            <div className="row gap-sm" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="modal-body">Enter your account email and we'll send you a reset link.</p>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospital.org"
              />
            </div>
            <div className="row gap-sm" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Send reset link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('mera_admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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
      } else if (response.user.role === 'mera_admin') {
        navigate('/mera-admin', { replace: true });
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

          <div style={{ textAlign: 'right', marginTop: '-0.4rem' }}>
            <button
              type="button"
              className="login-footer-link"
              onClick={() => setShowForgotPassword(true)}
            >
              Forgot Password?
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>

      <div className="login-footer">
        <button type="button" className="login-footer-link" onClick={() => navigate('/terms-and-conditions')}>
          Terms & Conditions
        </button>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}