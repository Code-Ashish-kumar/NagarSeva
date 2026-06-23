import { useAuth } from '../context/AuthContext';

/**
 * Placeholder MapView — replaced on Day 2 with the real Leaflet map.
 * For now it just proves auth works: shows the logged-in user's info.
 */
export default function MapView() {
  const { user, logout } = useAuth();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      padding: 32,
      fontFamily: 'var(--font)',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px 48px',
        textAlign: 'center',
        maxWidth: 480,
        width: '100%',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏙️</div>
        <h1 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: 8 }}>
          Welcome, {user?.name}!
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
          Role: <strong style={{ color: 'var(--accent)' }}>{user?.role}</strong>
        </p>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: '0.875rem' }}>
          ✅ Authentication working correctly.
          <br />Map view will be built on Day 2.
        </p>
        <button
          onClick={logout}
          style={{
            background: 'var(--danger-dim)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            padding: '10px 24px',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            fontWeight: 600,
            fontSize: '0.9rem',
            transition: 'all 0.2s',
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
