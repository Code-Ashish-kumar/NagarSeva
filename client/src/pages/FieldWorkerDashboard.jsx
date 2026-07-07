/**
 * pages/FieldWorkerDashboard.jsx
 *
 * Field Worker dashboard:
 * - Header: worker name + designation + department
 * - Stats strip: Active / In Progress / Resolved counts
 * - Toggle: Active (ASSIGNED + IN_PROGRESS) ↔ Resolved
 * - Issue cards: thumbnail, category, status badge, address,
 *   Start button (ASSIGNED) or Resume button (IN_PROGRESS)
 *
 * Clicking Start/Resume navigates to /field-worker/issues/:id
 */
import { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../slices/authSlice';
import { apiConnector } from '../services/apiConnector';
import { endpoints } from '../services/api';
import '../styles/fieldworker.css';

const CATEGORY_LABELS = {
  POTHOLE: '🕳️ Pothole', STREETLIGHT: '💡 Street Light', SEWAGE: '🚰 Sewage',
  GARBAGE: '🗑️ Garbage', WATER_SUPPLY: '💧 Water Supply', ROAD_DAMAGE: '🛣️ Road Damage',
  ENCROACHMENT: '🚧 Encroachment', STRAY_ANIMALS: '🐕 Stray Animals',
  DEAD_ANIMAL: '💀 Dead Animal', PUBLIC_TOILET: '🚻 Public Toilet',
  DRAIN_BLOCKAGE: '🚰 Drain Blockage', FALLEN_TREE: '🌳 Fallen Tree',
  ABANDONED_VEHICLE: '🚗 Abandoned Vehicle', AIR_POLLUTION: '🌫️ Air Pollution', OTHER: '📋 Other',
};

function StatusBadge({ status }) {
  const map = {
    ASSIGNED:    { cls: 'fw-status-assigned',    label: '⏳ Assigned' },
    IN_PROGRESS: { cls: 'fw-status-in_progress', label: '🔧 In Progress' },
    RESOLVED:    { cls: 'fw-status-resolved',    label: '✅ Resolved' },
    CLOSED:      { cls: 'fw-status-closed',      label: '🔒 Closed' },
  };
  const s = map[status] || { cls: '', label: status };
  return <span className={`fw-status ${s.cls}`}>{s.label}</span>;
}

export default function FieldWorkerDashboard() {
  const { user }   = useSelector((s) => s.auth);
  const dispatch   = useDispatch();
  const navigate   = useNavigate();

  const [tab, setTab]         = useState('active');   // 'active' | 'resolved'
  const [active, setActive]   = useState([]);
  const [resolved, setResolved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);       // DB profile with designation + dept

  // Load worker profile (designation + dept name) from /auth/me
  useEffect(() => {
    apiConnector('GET', endpoints.ME_API)
      .then((res) => setProfile(res.user))
      .catch(() => {});
  }, []);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, resolvedRes] = await Promise.all([
        apiConnector('GET', endpoints.FW_ACTIVE_API),
        apiConnector('GET', endpoints.FW_RESOLVED_API),
      ]);
      setActive(activeRes.data   || []);
      setResolved(resolvedRes.data || []);
    } catch (err) {
      console.error('[FW] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  // Auto-refresh every 45s
  useEffect(() => {
    const t = setInterval(fetchIssues, 45000);
    return () => clearInterval(t);
  }, [fetchIssues]);

  function handleLogout() {
    apiConnector('POST', endpoints.LOGOUT_API).catch(() => {});
    dispatch(clearAuth());
    navigate('/login', { replace: true });
  }

  const inProgress = active.filter((i) => i.status === 'IN_PROGRESS').length;
  const assigned   = active.filter((i) => i.status === 'ASSIGNED').length;

  const issues = tab === 'active' ? active : resolved;

  return (
    <div className="fw-page">
      {/* Header */}
      <header className="fw-header">
        <div className="fw-header-left">
          <h1 className="fw-header-name">🔧 {profile?.name || user?.name}</h1>
          {profile?.designation && (
            <span className="fw-header-designation">{profile.designation}</span>
          )}
          {profile?.department_name && (
            <span className="fw-header-dept">{profile.department_name}</span>
          )}
        </div>
        <div className="fw-header-actions">
          <button className="fw-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Stats */}
      <div className="fw-stats">
        <div className="fw-stat">
          <span className="fw-stat-val">{assigned}</span>
          <span className="fw-stat-label">Assigned</span>
        </div>
        <div className="fw-stat">
          <span className="fw-stat-val">{inProgress}</span>
          <span className="fw-stat-label">In Progress</span>
        </div>
        <div className="fw-stat">
          <span className="fw-stat-val">{resolved.length}</span>
          <span className="fw-stat-label">Resolved</span>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="fw-toggle-bar">
        <button
          className={`fw-toggle-btn ${tab === 'active' ? 'active' : ''}`}
          onClick={() => setTab('active')}
        >
          🔨 Active ({active.length})
        </button>
        <button
          className={`fw-toggle-btn ${tab === 'resolved' ? 'active' : ''}`}
          onClick={() => setTab('resolved')}
        >
          ✅ Resolved ({resolved.length})
        </button>
      </div>

      {/* Issue list */}
      <div className="fw-section">
        {loading ? (
          <div className="fw-loading"><span className="spinner" style={{ width: 20, height: 20 }} /> Loading…</div>
        ) : issues.length === 0 ? (
          <div className="fw-empty">
            {tab === 'active' ? '🎉 No active issues assigned to you right now.' : '📭 No resolved issues yet.'}
          </div>
        ) : (
          issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onAction={() => navigate(`/field-worker/issues/${issue.id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function IssueCard({ issue, onAction }) {
  const category = CATEGORY_LABELS[issue.category] || issue.category;

  return (
    <div className="fw-card">
      {issue.thumbnail
        ? <img className="fw-card-thumb" src={issue.thumbnail} alt="" />
        : <div className="fw-card-thumb-placeholder">{category.split(' ')[0]}</div>
      }
      <div className="fw-card-body">
        <div className="fw-card-top">
          <span className="fw-card-id">{issue.short_id}</span>
          <StatusBadge status={issue.status} />
        </div>
        <p className="fw-card-category">{category}</p>
        <p className="fw-card-address">{issue.address || `${issue.lat?.toFixed(4)}, ${issue.lng?.toFixed(4)}`}</p>

        {(issue.status === 'ASSIGNED' || issue.status === 'IN_PROGRESS') && (
          <button
            className={`fw-btn-start ${issue.status === 'ASSIGNED' ? 'start' : 'resume'}`}
            onClick={onAction}
          >
            {issue.status === 'ASSIGNED' ? '▶ Start Work' : '↩ Resume'}
          </button>
        )}
      </div>
    </div>
  );
}
