/**
 * pages/SuperAdminDashboard.jsx
 *
 * Central intake & routing engine for SUPER_ADMIN.
 * - Global stats bar
 * - Triaging queue (SUBMITTED issues, priority-ordered)
 * - Review modal with Verify/Reject actions
 * - Department management
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

export default function SuperAdminDashboard() {
  const { user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [stats, setStats]           = useState(null);
  const [queue, setQueue]           = useState([]);
  const [departments, setDepts]     = useState([]);
  const [designations, setDesignations] = useState({}); // full vocab map
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason]   = useState('');
  const [selectedDept, setSelectedDept]   = useState('');
  const [adminDesignation, setAdminDesignation] = useState('');
  const [view, setView]             = useState('queue'); // 'queue' | 'review' | 'depts'
  const [newDeptName, setNewDeptName]     = useState('');

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, queueRes, deptRes, desigRes] = await Promise.all([
        apiConnector('GET', endpoints.SA_STATS_API),
        apiConnector('GET', endpoints.SA_QUEUE_API),
        apiConnector('GET', endpoints.SA_DEPARTMENTS_API),
        apiConnector('GET', endpoints.SA_DESIGNATIONS_API),
      ]);
      setStats(statsRes);
      setQueue(queueRes.data || []);
      setDepts(deptRes.data || []);
      setDesignations(desigRes.data || {});
    } catch (err) {
      console.error('[SuperAdmin] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh queue every 30 seconds to reflect upvote priority changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (view === 'queue') fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [view, fetchData]);

  function openReview(issueId) {
    setSelectedId(issueId);
    setView('review');
    setDetailLoading(true);
    setRejectReason('');
    setSelectedDept('');
    setAdminDesignation('');
    apiConnector('GET', endpoints.SA_ISSUE_DETAIL_API(issueId))
      .then(setDetail)
      .catch((err) => console.error('[detail]', err))
      .finally(() => setDetailLoading(false));
  }

  // Verify action
  async function handleVerify() {
    if (!selectedDept) return alert('Please select a department.');
    setActionLoading(true);
    try {
      await apiConnector('PATCH', endpoints.SA_VERIFY_API(selectedId), {
        department_id: parseInt(selectedDept),
        admin_designation: adminDesignation || null,
      });
      setView('queue');
      setDetail(null);
      fetchData();
    } catch (err) {
      alert(err?.data?.message || 'Failed to verify.');
    } finally {
      setActionLoading(false);
    }
  }

  // Reject action
  async function handleReject() {
    if (rejectReason.length < 5) return alert('Rejection reason must be at least 5 characters.');
    setActionLoading(true);
    try {
      await apiConnector('PATCH', endpoints.SA_REJECT_API(selectedId), { reason: rejectReason });
      setView('queue');
      setDetail(null);
      fetchData();
    } catch (err) {
      alert(err?.data?.message || 'Failed to reject.');
    } finally {
      setActionLoading(false);
    }
  }

  // Create department
  async function handleCreateDept(e) {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    try {
      await apiConnector('POST', endpoints.SA_DEPARTMENTS_API, { name: newDeptName.trim() });
      setNewDeptName('');
      fetchData();
    } catch (err) {
      alert(err?.data?.message || 'Failed to create department.');
    }
  }

  // Delete department
  async function handleDeleteDept(id) {
    if (!confirm('Soft-delete this department?')) return;
    try {
      await apiConnector('DELETE', `${endpoints.SA_DEPARTMENTS_API}/${id}`);
      fetchData();
    } catch (err) {
      alert(err?.data?.message || 'Failed to delete.');
    }
  }

  function handleLogout() {
    apiConnector('POST', endpoints.LOGOUT_API).catch(() => {});
    localStorage.clear();
    dispatch(clearAuth());
    navigate('/login', { replace: true });
  }

  if (loading) {
    return (
      <div className="sa-page"><div className="sa-loading"><span className="spinner" style={{ width: 24, height: 24 }} /> Loading…</div></div>
    );
  }

  return (
    <div className="sa-page">
      {/* Header */}
      <header className="sa-header">
        <div>
          <h1 className="sa-title">🛡️ SuperAdmin</h1>
          <p className="sa-subtitle">Welcome, {user?.name}</p>
        </div>
        <div className="sa-header-actions">
          <button className={`sa-tab ${view === 'queue' ? 'active' : ''}`} onClick={() => setView('queue')}>Queue</button>
          <button className={`sa-tab ${view === 'depts' ? 'active' : ''}`} onClick={() => setView('depts')}>Departments</button>
          <button className="sa-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Stats Bar */}
      {stats && (
        <div className="sa-stats-bar">
          <div className="sa-stat"><span className="sa-stat-val">{stats.pending_count}</span><span className="sa-stat-label">Pending</span></div>
          <div className="sa-stat"><span className="sa-stat-val">{stats.assigned_count}</span><span className="sa-stat-label">Assigned</span></div>
          <div className="sa-stat"><span className="sa-stat-val">{stats.in_progress_count}</span><span className="sa-stat-label">In Progress</span></div>
          <div className="sa-stat"><span className="sa-stat-val">{stats.resolved_count}</span><span className="sa-stat-label">Resolved</span></div>
          <div className="sa-stat"><span className="sa-stat-val">{stats.verification_rate}%</span><span className="sa-stat-label">Verify Rate</span></div>
        </div>
      )}

      {/* Triaging Queue View */}
      {view === 'queue' && (
        <div className="sa-section">
          <h2 className="sa-section-title">Triaging Queue ({queue.length} pending)
            <button className="sa-refresh-btn" onClick={fetchData} title="Refresh">🔄</button>
          </h2>
          {queue.length === 0 ? (
            <p className="sa-empty">🎉 No issues pending review!</p>
          ) : (
            <div className="sa-queue">
              {queue.map((issue) => (
                <div key={issue.id} className="sa-queue-card" onClick={() => openReview(issue.id)}>
                  {issue.thumbnail && <img className="sa-queue-thumb" src={issue.thumbnail} alt="" />}
                  <div className="sa-queue-body">
                    <div className="sa-queue-top">
                      <span className="sa-queue-id">{issue.short_id}</span>
                      <span className="sa-queue-priority">⬆ {issue.priority_score} · 👥 {issue.report_count}</span>
                    </div>
                    <p className="sa-queue-category">{CATEGORY_LABELS[issue.category] || issue.category}</p>
                    <p className="sa-queue-address">{issue.address || `${issue.lat?.toFixed(4)}, ${issue.lng?.toFixed(4)}`}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {view === 'review' && (
        <div className="sa-section">
          <button className="sa-back" onClick={() => setView('queue')}>← Back to Queue</button>
          {detailLoading ? (
            <div className="sa-loading"><span className="spinner" /> Loading detail…</div>
          ) : detail ? (
            <div className="sa-review">
              <h2 className="sa-section-title">Review: {detail.issue.short_id}</h2>

              {/* Images */}
              <div className="sa-review-images">
                {detail.images.filter(i => i.image_type === 'REPORT').map((img) => (
                  <img key={img.id} src={img.image_url} alt="Evidence" className="sa-review-img" />
                ))}
              </div>

              {/* Issue Info */}
              <div className="sa-review-info">
                <div className="sa-review-field"><span>Category</span><strong>{CATEGORY_LABELS[detail.issue.category]}</strong></div>
                <div className="sa-review-field"><span>Reports</span><strong>👥 {detail.issue.report_count}</strong></div>
                <div className="sa-review-field"><span>Priority</span><strong>⬆ {detail.issue.priority_score}</strong></div>
                <div className="sa-review-field"><span>Reporter</span><strong>{detail.issue.reporter_name}</strong></div>
                <div className="sa-review-field"><span>Watchers</span><strong>{detail.watcher_count}</strong></div>
                <div className="sa-review-field"><span>Address</span><strong>{detail.issue.address || '—'}</strong></div>
              </div>

              {detail.issue.description && (
                <div className="sa-review-desc">
                  <p className="sa-review-desc-label">Description</p>
                  <p>{detail.issue.description}</p>
                </div>
              )}

              {/* Actions */}
              <div className="sa-review-actions">
                  {/* Verify */}
                <div className="sa-action-box sa-action-verify">
                  <h3>✅ Verify & Route</h3>

                  {/* Step 1: Department */}
                  <select
                    value={selectedDept}
                    onChange={(e) => { setSelectedDept(e.target.value); setAdminDesignation(''); }}
                    className="sa-select"
                  >
                    <option value="">Select department…</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>

                  {/* Step 2: Admin designation — derived from the selected dept's dept_type */}
                  {(() => {
                    const selDept = departments.find((d) => String(d.id) === String(selectedDept));
                    const adminOptions = selDept?.dept_type ? designations[selDept.dept_type]?.ADMIN : null;
                    if (!selectedDept || !adminOptions?.length) return null;
                    return (
                      <select
                        value={adminDesignation}
                        onChange={(e) => setAdminDesignation(e.target.value)}
                        className="sa-select"
                        style={{ marginTop: 8 }}
                      >
                        <option value="">Any admin (no preference)</option>
                        {adminOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    );
                  })()}

                  <button
                    className="sa-btn-verify"
                    onClick={handleVerify}
                    disabled={actionLoading || !selectedDept}
                  >
                    {actionLoading ? '…' : 'Verify & Assign'}
                  </button>
                </div>

                {/* Reject */}
                <div className="sa-action-box sa-action-reject">
                  <h3>❌ Reject</h3>
                  <textarea
                    className="sa-textarea"
                    placeholder="Reason for rejection (mandatory)…"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    maxLength={500}
                  />
                  <button className="sa-btn-reject" onClick={handleReject} disabled={actionLoading || rejectReason.length < 5}>
                    {actionLoading ? '…' : 'Reject & Notify'}
                  </button>
                </div>
              </div>

              {/* Audit Trail */}
              {detail.audit_trail.length > 0 && (
                <div className="sa-audit">
                  <h3>Audit Trail</h3>
                  {detail.audit_trail.map((entry) => (
                    <div key={entry.id} className="sa-audit-entry">
                      <span className="sa-audit-status">{entry.from_status} → {entry.to_status}</span>
                      <span className="sa-audit-by">{entry.changed_by_name}</span>
                      <span className="sa-audit-time">{new Date(entry.created_at).toLocaleString('en-IN')}</span>
                      {entry.note && <p className="sa-audit-note">{entry.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p>Failed to load detail.</p>
          )}
        </div>
      )}

      {/* Departments View */}
      {view === 'depts' && (
        <div className="sa-section">
          <h2 className="sa-section-title">Department Management</h2>
          <form className="sa-dept-form" onSubmit={handleCreateDept}>
            <input
              type="text"
              placeholder="New department name…"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="sa-dept-input"
            />
            <button type="submit" className="sa-btn-verify">+ Add</button>
          </form>
          <div className="sa-dept-list">
            {departments.map((d) => (
              <div key={d.id} className="sa-dept-card">
                <div>
                  <strong>{d.name}</strong>
                  <span className="sa-dept-meta">{d.active_issues} issues · {d.worker_count} workers</span>
                </div>
                <button className="sa-dept-delete" onClick={() => handleDeleteDept(d.id)}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
