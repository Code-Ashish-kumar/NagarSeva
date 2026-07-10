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
import ForgotPassword from "./pages/ForgotPassword";
import CitizenDashboard from "./pages/CitizenDashboard";
import FieldWorkerDashboard from "./pages/FieldWorkerDashboard";
import IssueWorkPage from "./pages/IssueWorkPage";
import AdminDashboard from "./pages/AdminDashboard";
import ReportWizard from "./pages/ReportWizard";
import MyComplaints from "./pages/MyComplaints";
import CityPulse from "./pages/CityPulse";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import Landing from "./pages/Landing";
import Admin_Home from "./pages/Admin_Home";
import Admin_Reports from "./pages/Admin_Reports";
import Admin_FieldWorkers from "./pages/Admin_FieldWorkers";
import SuperAdmin_Home from "./pages/SuperAdmin_Home";
import SuperAdmin_Reports from "./pages/SuperAdmin_Reports";
import SuperAdmin_Departments from "./pages/SuperAdmin_Departments";


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
      <Route path="/forgot-password" element={<ForgotPassword />} />

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
        path="/citizen/complaints"
        element={
          <ProtectedRoute roles={["CITIZEN"]}>
            <MyComplaints />
          </ProtectedRoute>
        }
      />
      <Route
        path="/citizen/city-pulse"
        element={
          <ProtectedRoute roles={["CITIZEN"]}>
            <CityPulse />
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
        path="/field-worker/issues/:id"
        element={
          <ProtectedRoute roles={["FIELD_WORKER"]}>
            <IssueWorkPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Admin_Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Admin_Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/field_workers"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Admin_FieldWorkers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <SuperAdmin_Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/reports"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <SuperAdmin_Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin/departments"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <SuperAdmin_Departments />
          </ProtectedRoute>
        }
      />
      <Route path="/super-admin" element={<Navigate to="/superadmin" replace />} />

      {/* Default: redirect to correct dashboard based on role */}
      <Route path="/"  element={<RoleRedirect />} />
      <Route path="*"  element={<Navigate to="/" replace />} />
    </Routes>
  );
}
