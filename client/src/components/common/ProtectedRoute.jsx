import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Wraps protected pages.
 * - While auth state is loading → show nothing (prevents flash)
 * - Not authenticated → redirect to /login (with return URL saved)
 * - Role restriction provided → check user role, redirect to / if denied
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-base)' }}>
        <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, borderColor: 'var(--bg-elevated)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
