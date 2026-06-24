import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { clearAuth } from "../slices/authSlice";

export default function CitizenDashboard() {
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
        <div style={{ fontSize: 56, marginBottom: 16 }}>👤</div>
        <h1 style={{ color: "var(--color-primary)", fontSize: "1.5rem", marginBottom: 8 }}>
          Citizen Dashboard
        </h1>
        <p style={{ color: "var(--color-secondary)", marginBottom: 4 }}>
          Welcome, <strong style={{ color: "var(--color-accent)" }}>{user?.name}</strong>
        </p>
        <p style={{ color: "var(--color-muted)", marginBottom: 32, fontSize: "0.875rem" }}>
          Report civic issues, track complaints, and view nearby problems.
          <br />🚧 Full dashboard coming soon.
        </p>
        <button onClick={handleLogout} style={{ background: "var(--color-danger-dim)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
