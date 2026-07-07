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
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason]   = useState('');
  const [selectedDept, setSelectedDept]   = useState('');
  const [view, setView]             = useState('queue'); // 'queue' | 'review' | 'depts' | 'staff'
  const [newDeptName, setNewDeptName]     = useState('');
  const [staff, setStaff]                 = useState([]);
  const [staffForm, setStaffForm]         = useState({ name: '', email: '', role: 'FIELD_WORKER', department_id: '' });
  const [staffLoading, setStaffLoading]   = useState(false);
  const [staffMsg, setStaffMsg]           = useState('');

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, queueRes, deptRes, staffRes] = await Promise.all([
        apiConnector('GET', endpoints.SA_STATS_API),
        apiConnector('GET', endpoints.SA_QUEUE_API),
        apiConnector('GET', endpoints.SA_DEPARTMENTS_API),
        apiConnector('GET', endpoints.SA_STAFF_API),
      ]);
      setStats(statsRes);
      setQueue(queueRes.data || []);
      setDepts(deptRes.data || []);
      setStaff(staffRes.data || []);
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

  // Open review modal
  async function openReview(issueId) {
    setSelectedId(issueId);
    setView('review');
    setDetailLoading(true);
    setRejectReason('');
    setSelectedDept('');
    try {
      const res = await apiConnector('GET', endpoints.SA_ISSUE_DETAIL_API(issueId));
      setDetail(res);
    } catch (err) {
      console.error('[detail]', err);
    } finally {
      setDetailLoading(false);
    }
  }

  // Verify action
  async function handleVerify() {
    if (!selectedDept) return alert('Please select a department.');
    setActionLoading(true);
    try {
      await apiConnector('PATCH', endpoints.SA_VERIFY_API(selectedId), { department_id: parseInt(selectedDept) });
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

  // Create staff member
  async function handleCreateStaff(e) {
    e.preventDefault();
    if (!staffForm.name || !staffForm.email || !staffForm.department_id) {
      setStaffMsg('All fields are required.');
      return;
    }
    setStaffLoading(true);
    setStaffMsg('');
    try {
      const res = await apiConnector('POST', endpoints.SA_STAFF_API, {
        ...staffForm,
        department_id: parseInt(staffForm.department_id),
      });
      const icon = res.email_sent ? '✅' : '⚠️';
      setStaffMsg(`${icon} ${res.message}${res.dev_password ? ` (Dev password: ${res.dev_password})` : ''}`);
      setStaffForm({ name: '', email: '', role: 'FIELD_WORKER', department_id: '' });
      fetchData();
    } catch (err) {
      setStaffMsg(`❌ ${err?.data?.message || 'Failed to create staff.'}`);
    } finally {
      setStaffLoading(false);
    }
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
          <button className={`sa-tab ${view === 'staff' ? 'active' : ''}`} onClick={() => setView('staff')}>Staff</button>
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
                  <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className="sa-select">
                    <option value="">Select department…</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <button className="sa-btn-verify" onClick={handleVerify} disabled={actionLoading || !selectedDept}>
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

      {/* Staff Management View */}
      {view === 'staff' && (
        <div className="sa-section">
          <h2 className="sa-section-title">Staff Management</h2>

          {/* Create Staff Form */}
          <form className="sa-staff-form" onSubmit={handleCreateStaff}>
            <h3 className="sa-staff-form-title">Add New Staff Member</h3>
            <div className="sa-staff-grid">
              <div className="sa-staff-field">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="Ravi Kumar"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm(f => ({ ...f, name: e.target.value }))}
                  className="sa-dept-input"
                  required
                />
              </div>
              <div className="sa-staff-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="ravi@example.com"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm(f => ({ ...f, email: e.target.value }))}
                  className="sa-dept-input"
                  required
                />
              </div>
              <div className="sa-staff-field">
                <label>Role</label>
                <select
                  value={staffForm.role}
                  onChange={(e) => setStaffForm(f => ({ ...f, role: e.target.value }))}
                  className="sa-select"
                >
                  <option value="FIELD_WORKER">Field Worker</option>
                  <option value="ADMIN">Department Admin</option>
                </select>
              </div>
              <div className="sa-staff-field">
                <label>Department</label>
                <select
                  value={staffForm.department_id}
                  onChange={(e) => setStaffForm(f => ({ ...f, department_id: e.target.value }))}
                  className="sa-select"
                  required
                >
                  <option value="">Select department…</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            {staffMsg && (
              <p className="sa-staff-msg" style={{ color: staffMsg.startsWith('✅') ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {staffMsg}
              </p>
            )}
            <button type="submit" className="sa-btn-verify" disabled={staffLoading} style={{ marginTop: 12 }}>
              {staffLoading ? '…' : '📧 Create & Send Credentials'}
            </button>
          </form>

          {/* Staff List */}
          <h3 className="sa-section-title" style={{ marginTop: 28 }}>Current Staff ({staff.length})</h3>
          <div className="sa-dept-list">
            {staff.map((s) => (
              <div key={s.id} className="sa-dept-card">
                <div>
                  <strong>{s.name}</strong>
                  <span className="sa-dept-meta">
                    {s.role === 'ADMIN' ? '🛡️ Admin' : '🔧 Field Worker'} · {s.department_name || '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{s.email}</span>
                  <button
                    className="admin-allocate-btn"
                    onClick={async () => {
                      if (!confirm(`Reset password and resend credentials to ${s.email}?`)) return;
                      try {
                        const res = await apiConnector('POST', `${endpoints.SA_STAFF_API}/${s.id}/resend-credentials`);
                        alert(res.message + (res.dev_password ? `\nDev password: ${res.dev_password}` : ''));
                      } catch (err) {
                        alert(err?.data?.message || 'Failed to resend.');
                      }
                    }}
                    title="Reset password & resend credentials email"
                  >
                    📧 Resend
                  </button>
                </div>
              </div>
            ))}
            {staff.length === 0 && <p className="sa-empty">No staff members yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
