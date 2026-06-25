import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setAuth, clearAuth } from "./slices/authSlice";
import { checkAuth } from "./services/Operations/authAPI";

import ProtectedRoute from "./components/common/ProtectedRoute";
import RoleRedirect from "./components/common/RoleRedirect";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import CitizenDashboard from "./pages/CitizenDashboard";
import FieldWorkerDashboard from "./pages/FieldWorkerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ReportWizard from "./pages/ReportWizard";


export default function App() {
  const dispatch = useDispatch();

  // On mount: validate session via the httpOnly cookie (sent automatically by the browser).
  // We no longer check localStorage — auth state lives in the cookie.
  useEffect(() => {
    async function verifyUser() {
      const data = await checkAuth(); // GET /api/auth/me — cookie attached automatically
      if (data && data.user) {
        dispatch(setAuth(data.user));
      } else {
        dispatch(clearAuth());
      }
    }
    verifyUser();
  }, [dispatch]);

  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login"        element={<Login />} />
      <Route path="/register"     element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Role-based protected dashboards */}
      <Route
        path="/citizen"
        element={
          <ProtectedRoute roles={["CITIZEN"]}>
            <CitizenDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/citizen/report"
        element={
          <ProtectedRoute roles={["CITIZEN"]}>
            <ReportWizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/field-worker"
        element={
          <ProtectedRoute roles={["FIELD_WORKER"]}>
            <FieldWorkerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPER_ADMIN"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Default: redirect to correct dashboard based on role */}
      <Route path="/"  element={<RoleRedirect />} />
      <Route path="*"  element={<Navigate to="/" replace />} />
    </Routes>
  );
}
