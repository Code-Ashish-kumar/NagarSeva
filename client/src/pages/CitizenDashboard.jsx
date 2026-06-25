/**
 * pages/CitizenDashboard.jsx
 *
 * Landing dashboard for the CITIZEN role.
 * - Greets the user by name.
 * - Primary CTA: "Register Complaint" → navigates to /citizen/report.
 * - Placeholder stats row (real data in a later sprint).
 */
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../slices/authSlice';
import { setStep } from '../slices/complaintSlice';
import { apiConnector } from '../services/apiConnector';
import { endpoints } from '../services/api';

export default function CitizenDashboard() {
  const { user }  = useSelector((state) => state.auth);
  const dispatch  = useDispatch();
  const navigate  = useNavigate();

  async function handleLogout() {
    try { await apiConnector('POST', endpoints.LOGOUT_API); } catch { /* ignore */ }
    localStorage.clear();
    dispatch(clearAuth());
    navigate('/login', { replace: true });
  }

  function handleRegisterComplaint() {
    dispatch(setStep(1));           // always start wizard from step 1
    navigate('/citizen/report');
  }

  return (
    <div className="citizen-landing">
      <div className="citizen-landing-card">

        {/* Logo ring */}
        <div className="citizen-logo-ring" aria-hidden="true">🏙️</div>

        {/* Welcome */}
        <h1 className="citizen-welcome-name">
          Welcome, {user?.name?.split(' ')[0] ?? 'Citizen'}!
        </h1>
        <p className="citizen-tagline">
          Help make your city better. Report civic issues — potholes, leaks,
          illegal dumping, broken lights and more — in just a few steps.
        </p>

        {/* Placeholder stats */}
        <div className="stats-row">
          <div className="stat-card">
            <p className="stat-value">—</p>
            <p className="stat-label">My Complaints</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">—</p>
            <p className="stat-label">Resolved</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">—</p>
            <p className="stat-label">Pending</p>
          </div>
        </div>

        {/* Actions */}
        <div className="citizen-actions">
          <button
            id="citizen-register-complaint-btn"
            className="btn-register-complaint"
            onClick={handleRegisterComplaint}
          >
            📋 Register Complaint
          </button>

          <button
            id="citizen-signout-btn"
            className="btn-signout-secondary"
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>

      </div>
    </div>
  );
}
