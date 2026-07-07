/**
 * pages/AdminDashboard.jsx
 *
 * Department Admin dashboard:
 * - Department stats
 * - Issue queue (ASSIGNED issues for their department)
 * - Smart allocation: ranked field workers with composite Worker Score
 * - Resource overview grid
 */
import { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../slices/authSlice';
import { apiConnector } from '../services/apiConnector';
import { endpoints } from '../services/api';

const CATEGORY_LABELS = {
  POTHOLE: '🕳️ Pothole', STREETLIGHT: '💡 Street Light', SEWAGE: '🚰 Sewage',
  GARBAGE: '🗑️ Garbage', WATER_SUPPLY: '💧 Water Supply', ROAD_DAMAGE: '🛣️ Road Damage',
  ENCROACHMENT: '🚧 Encroachment', STRAY_ANIMALS: '🐕 Stray Animals',
  DEAD_ANIMAL: '💀 Dead Animal', PUBLIC_TOILET: '🚻 Public Toilet',
  DRAIN_BLOCKAGE: '🚰 Drain Blockage', FALLEN_TREE: '🌳 Fallen Tree',
  ABANDONED_VEHICLE: '🚗 Abandoned Vehicle', AIR_POLLUTION: '🌫️ Air Pollution', OTHER: '📋 Other',
};

function WorkloadBadge({ count }) {
  const color = count <= 2 ? '#22c55e' : count <= 4 ? '#f59e0b' : '#ef4444';
  const icon = count <= 2 ? '🟢' : count <= 4 ? '🟡' : '🔴';
  return <span style={{ color, fontSize: '0.75rem', fontWeight: 700 }}>{icon} {count} active</span>;
}

export default function AdminDashboard() {
  const { user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [stats, setStats]       = useState(null);
  const [queue, setQueue]       = useState([]);
  const [workers, setWorkers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [assigningId, setAssigningId] = useState(null); // issue being assigned
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, queueRes, workersRes] = await Promise.all([
        apiConnector('GET', endpoints.ADMIN_STATS_API),
        apiConnector('GET', endpoints.ADMIN_QUEUE_API),
        apiConnector('GET', endpoints.ADMIN_WORKERS_API),
      ]);
      setStats(statsRes);
      setQueue(queueRes.data || []);
      setWorkers(workersRes.data || []);
    } catch (err) {
      console.error('[AdminDashboard] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleAssign(issueId, workerId) {
    setActionLoading(true);
    try {
      await apiConnector('PATCH', endpoints.ADMIN_ASSIGN_API(issueId), { assigned_to: workerId });
      setAssigningId(null);
      fetchData();
    } catch (err) {
      alert(err?.data?.message || 'Failed to assign.');
    } finally {
      setActionLoading(false);
    }
  }

  function handleLogout() {
    apiConnector('POST', endpoints.LOGOUT_API).catch(() => {});
    localStorage.clear();
    dispatch(clearAuth());
    navigate('/login', { replace: true });
  }

  if (loading) {
    return <div className="sa-page"><div className="sa-loading"><span className="spinner" style={{ width: 24, height: 24 }} /> Loading…</div></div>;
  }

  return (
    <div className="sa-page">
      {/* Header */}
      <header className="sa-header">
        <div>
          <h1 className="sa-title">📋 Department Admin</h1>
          <p className="sa-subtitle">{stats?.department_name || 'Department'} — {user?.name}</p>
        </div>
        <div className="sa-header-actions">
          <button className="sa-refresh-btn" onClick={fetchData} title="Refresh">🔄</button>
          <button className="sa-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <div className="sa-stats-bar">
          <div className="sa-stat"><span className="sa-stat-val">{stats.pending_assignment}</span><span className="sa-stat-label">Pending</span></div>
          <div className="sa-stat"><span className="sa-stat-val">{stats.in_progress}</span><span className="sa-stat-label">In Progress</span></div>
          <div className="sa-stat"><span className="sa-stat-val">{stats.resolved}</span><span className="sa-stat-label">Resolved</span></div>
          <div className="sa-stat"><span className="sa-stat-val">{stats.worker_count}</span><span className="sa-stat-label">Workers</span></div>
        </div>
      )}

      <div className="sa-section">
        {/* Issue Queue */}
        <h2 className="sa-section-title">
          Issues Pending Allocation ({queue.length})
          <button className="sa-refresh-btn" onClick={fetchData}>🔄</button>
        </h2>

        {queue.length === 0 ? (
          <p className="sa-empty">✅ All issues have been allocated!</p>
        ) : (
          <div className="sa-queue">
            {queue.map((issue) => (
              <div key={issue.id} className="sa-queue-card">
                {issue.thumbnail && <img className="sa-queue-thumb" src={issue.thumbnail} alt="" />}
                <div className="sa-queue-body">
                  <div className="sa-queue-top">
                    <span className="sa-queue-id">{issue.short_id}</span>
                    <span className="sa-queue-priority">⬆ {issue.priority_score} · 👥 {issue.report_count} · 📅 {issue.days_pending}d</span>
                  </div>
                  <p className="sa-queue-category">{CATEGORY_LABELS[issue.category] || issue.category}</p>
                  {issue.assigned_admin_designation && (
                    <p className="admin-routed-badge">🎯 Routed to: {issue.assigned_admin_designation}</p>
                  )}
                  <p className="sa-queue-address">{issue.address || '—'}</p>
                  <button
                    className="admin-allocate-btn"
                    onClick={() => setAssigningId(assigningId === issue.id ? null : issue.id)}
                  >
                    {assigningId === issue.id ? '✕ Cancel' : '👷 Allocate'}
                  </button>

                  {/* Worker Selection Panel */}
                  {assigningId === issue.id && (
                    <div className="admin-worker-panel">
                      <p className="admin-worker-panel-title">Select Field Worker (ranked by score)</p>
                      {workers.length === 0 ? (
                        <p style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>No field workers in your department.</p>
                      ) : (
                        workers.map((w) => (
                          <div key={w.id} className="admin-worker-row">
                            <div className="admin-worker-info">
                              <strong>{w.name}</strong>
                              {w.designation && <span className="admin-worker-designation">{w.designation}</span>}
                              <span className="admin-worker-score">Score: {w.worker_score}</span>
                              <WorkloadBadge count={w.active_count} />
                            </div>
                            <button
                              className="admin-assign-btn"
                              onClick={() => handleAssign(issue.id, w.id)}
                              disabled={actionLoading}
                            >
                              {actionLoading ? '…' : 'Assign'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resource Overview */}
        <h2 className="sa-section-title" style={{ marginTop: 32 }}>Resource Overview</h2>
        <div className="admin-resource-grid">
          {workers.map((w) => (
            <div key={w.id} className="admin-resource-card">
              <strong>{w.name}</strong>
              {w.designation && <span className="admin-worker-designation">{w.designation}</span>}
              <WorkloadBadge count={w.active_count} />
              <span className="admin-resource-resolved">{w.resolved_count} resolved</span>
            </div>
          ))}
          {workers.length === 0 && <p className="sa-empty">No field workers assigned to your department yet.</p>}
        </div>
      </div>
    </div>
  );
}
