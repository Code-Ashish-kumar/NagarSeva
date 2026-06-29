import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

/**
 * Redirects the authenticated user to their role-specific dashboard.
 * Used as the default "/" route target.
 */
export default function RoleRedirect() {
  const { user, loading, isAuthenticated } = useSelector((state) => state.auth);

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  switch (user?.role) {
    case "SUPER_ADMIN":
      return <Navigate to="/super-admin" replace />;
    case "ADMIN":
      return <Navigate to="/admin" replace />;
    case "FIELD_WORKER":
      return <Navigate to="/field-worker" replace />;
    case "CITIZEN":
    default:
      return <Navigate to="/citizen" replace />;
  }
}
