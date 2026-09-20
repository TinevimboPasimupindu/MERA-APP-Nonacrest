import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiCall, ENDPOINTS } from '../../services/api';
import logo from '../../assets/mera-logo.png';
import bgImage from '../../assets/ambulance-intro.png';

// Public, unauthenticated route "/reset-password?token=...". The one thing
// this whole feature was actually missing — the backend's
// PasswordResetConfirmView has existed and been fully tested for a while,
// but nothing anywhere (mobile or web) ever called it, because the emailed
// link pointed at a mobile deep-link scheme ("mera://") the app never
// actually registered (its real scheme is "frontend" — see
// mobile-frontend/app.json) and no screen existed to receive it either
// way. This page is the fix: every role that can end up on the receiving
// end of a reset email (hospital_admin/ambulance_admin/mera_admin/EMT) logs
// into the web app, so one shared web page — not a corrected deep link —
// is what actually closes the loop. See PROJECT_CONTEXT.md for the full
// investigation.
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiCall(
        ENDPOINTS.passwordResetConfirm,
        'POST',
        { token, new_password: newPassword, confirm_password: confirmPassword },
        false
      );
      setSuccess(true);
    } catch (err) {
      setError(
        err.token?.[0] || err.confirm_password?.[0] || err.detail ||
        'Could not reset your password. The link may have expired — request a new one and try again.'
      );
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
        <p className="portal-label">Reset your password</p>

        {!token ? (
          <p className="error-text">
            This link is missing its reset token. Use the link from your email, or request a new one from the login page.
          </p>
        ) : success ? (
          <p className="success-text">
            Your password has been reset. You can now log in with your new password below.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />

            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            {error && <p className="error-text">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        )}
      </div>

      <div className="login-footer">
        <button type="button" className="login-footer-link" onClick={() => navigate('/login')}>
          Back to login
        </button>
      </div>
    </div>
  );
}
