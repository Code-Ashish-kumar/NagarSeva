import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { clearAuth } from "../slices/authSlice";

export default function FieldWorkerDashboard() {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.clear();
    dispatch(clearAuth());
    navigate("/login", { replace: true });
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-base)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-elevated)", borderRadius: 16, padding: "40px 48px", textAlign: "center", maxWidth: 520, width: "100%" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔧</div>
        <h1 style={{ color: "var(--color-primary)", fontSize: "1.5rem", marginBottom: 8 }}>
          Field Worker Dashboard
        </h1>
        <p style={{ color: "var(--color-secondary)", marginBottom: 4 }}>
          Welcome, <strong style={{ color: "var(--color-accent)" }}>{user?.name}</strong>
        </p>
        <p style={{ color: "var(--color-muted)", marginBottom: 8, fontSize: "0.875rem" }}>
          View assigned tasks, update resolution status, and navigate to issue locations.
          <br />🚧 Full dashboard coming soon.
        </p>
        <div style={{ color: "var(--color-secondary)", fontSize: "0.8rem", marginBottom: 32, padding: "12px 16px", background: "var(--color-elevated)", borderRadius: 8 }}>
          Role: <strong>Field Worker</strong> &nbsp;|&nbsp; Zone: <strong>{user?.assigned_zone || "—"}</strong> &nbsp;|&nbsp; Dept: <strong>{user?.department || "—"}</strong>
        </div>
        <button onClick={handleLogout} style={{ background: "var(--color-danger-dim)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
