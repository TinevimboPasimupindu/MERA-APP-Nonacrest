import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, role = 'hospital_admin' }) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (status === 'guest' || !user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
