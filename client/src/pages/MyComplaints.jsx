/**
 * pages/MyComplaints.jsx
 *
 * Displays all complaints/issues filed by the current citizen.
 * Fetches from GET /api/issues/mine on mount.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setStep } from '../slices/complaintSlice';
import { apiConnector } from '../services/apiConnector';
import { endpoints } from '../services/api';

const CATEGORY_LABELS = {
  POTHOLE:           '🕳️ Pothole',
  STREETLIGHT:       '💡 Street Light',
  SEWAGE:            '🚰 Sewage',
  GARBAGE:           '🗑️ Garbage',
  WATER_SUPPLY:      '💧 Water Supply',
  ROAD_DAMAGE:       '🛣️ Road Damage',
  ENCROACHMENT:      '🚧 Encroachment',
  STRAY_ANIMALS:     '🐕 Stray Animals',
  DEAD_ANIMAL:       '💀 Dead Animal',
  PUBLIC_TOILET:     '🚻 Public Toilet',
  DRAIN_BLOCKAGE:    '🚰 Drain Blockage',
  FALLEN_TREE:       '🌳 Fallen Tree',
  ABANDONED_VEHICLE: '🚗 Abandoned Vehicle',
  AIR_POLLUTION:     '🌫️ Air Pollution',
  OTHER:             '📋 Other',
};

const STATUS_STYLES = {
  SUBMITTED:   { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8',  label: 'Submitted' },
  VERIFIED:    { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e',  label: 'Verified' },
  REJECTED:    { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444',  label: 'Rejected' },
  ASSIGNED:    { bg: 'rgba(168,85,247,0.12)',  color: '#a855f7',  label: 'Assigned' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b',  label: 'In Progress' },
  RESOLVED:    { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e',  label: 'Resolved' },
  CLOSED:      { bg: 'rgba(100,116,139,0.12)', color: '#64748b', label: 'Closed' },
  REOPENED:    { bg: 'rgba(249,115,22,0.12)',  color: '#f97316',  label: 'Reopened' },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.SUBMITTED;
  return (
    <span
      className="complaint-status-badge"
      style={{ background: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyComplaints() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [issues, setIssues]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    async function fetchIssues() {
      try {
        const data = await apiConnector('GET', endpoints.MY_ISSUES_API);
        setIssues(data.data || []);
      } catch (err) {
        setError(err?.data?.message || 'Failed to load your complaints.');
      } finally {
        setLoading(false);
      }
    }
    fetchIssues();
  }, []);

  function handleNewComplaint() {
    dispatch(setStep(1));
    navigate('/citizen/report');
  }

  return (
    <div className="my-complaints-page">
      {/* Header */}
      <div className="my-complaints-header">
        <div>
          <h1 className="my-complaints-title">My Complaints</h1>
          <p className="my-complaints-subtitle">
            Track the status of all civic issues you've reported
          </p>
        </div>
        <button className="btn-new-complaint" onClick={handleNewComplaint}>
          + New Complaint
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="my-complaints-loading">
          <span className="spinner" style={{ width: 24, height: 24, borderTopColor: 'var(--color-accent)' }} />
          <p>Loading your complaints…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rejection-banner" role="alert">
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && issues.length === 0 && (
        <div className="my-complaints-empty">
          <div className="my-complaints-empty-icon">📋</div>
          <h2>No complaints yet</h2>
          <p>Report your first civic issue and track its resolution here.</p>
          <button className="btn-next" onClick={handleNewComplaint} style={{ marginTop: 16, maxWidth: 280 }}>
            📋 Register Complaint
          </button>
        </div>
      )}

      {/* Complaints list */}
      {!loading && issues.length > 0 && (
        <div className="complaints-list">
          {issues.map((issue) => (
            <div key={issue.id} className="complaint-card">
              {/* Thumbnail */}
              {issue.thumbnail && (
                <div className="complaint-card-thumb">
                  <img src={issue.thumbnail} alt={issue.category} />
                </div>
              )}

              {/* Content */}
              <div className="complaint-card-body">
                <div className="complaint-card-top">
                  <span className="complaint-card-id">{issue.short_id}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {issue.report_count > 1 && (
                      <span
                        className="complaint-status-badge"
                        style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}
                      >
                        👥 {issue.report_count} reports
                      </span>
                    )}
                    <StatusBadge status={issue.status} />
                  </div>
                </div>

                <p className="complaint-card-category">
                  {CATEGORY_LABELS[issue.category] ?? issue.category}
                </p>

                {issue.description && (
                  <p className="complaint-card-desc">
                    {issue.description.length > 100
                      ? issue.description.slice(0, 100) + '…'
                      : issue.description}
                  </p>
                )}

                <div className="complaint-card-meta">
                  {issue.address && (
                    <span className="complaint-card-address">
                      📍 {issue.address.length > 50 ? issue.address.slice(0, 50) + '…' : issue.address}
                    </span>
                  )}
                  <span className="complaint-card-date">
                    {formatDate(issue.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Back to dashboard */}
      <button
        className="btn-back"
        onClick={() => navigate('/citizen')}
        style={{ marginTop: 24 }}
      >
        ← Back to Dashboard
      </button>
    </div>
  );
}
