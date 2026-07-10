/**
 * pages/IssueWorkPage.jsx
 *
 * Full issue work view for a field worker:
 * - Title, status (auto-transitions ASSIGNED → IN_PROGRESS on first open)
 * - Description, address, report images, watcher count
 * - Proximity-gated camera capture:
 *     Worker must be within PROXIMITY_RADIUS metres of the issue location.
 *     Geolocation API verifies position, then opens the rear camera
 *     (getUserMedia) as a live viewfinder. A shutter button captures frames.
 * - Note field
 * - "Mark as Resolved" button
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiConnector } from '../services/apiConnector';
import { endpoints } from '../services/api';
import '../styles/fieldworker.css';

// Fix Leaflet default marker icons (Vite asset pipeline strips the URLs)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Custom red site pin icon */
const SITE_ICON = new L.DivIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;border-radius:50% 50% 50% 0;
    background:#ef4444;border:3px solid #fff;
    transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(0,0,0,0.45);
  "></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -34],
});

/** Max distance (metres) from the issue site to allow camera access */
const PROXIMITY_RADIUS = 200;

const CATEGORY_LABELS = {
  POTHOLE: '🕳️ Pothole', STREETLIGHT: '💡 Street Light', SEWAGE: '🚰 Sewage',
  GARBAGE: '🗑️ Garbage', WATER_SUPPLY: '💧 Water Supply', ROAD_DAMAGE: '🛣️ Road Damage',
  ENCROACHMENT: '🚧 Encroachment', STRAY_ANIMALS: '🐕 Stray Animals',
  DEAD_ANIMAL: '💀 Dead Animal', PUBLIC_TOILET: '🚻 Public Toilet',
  DRAIN_BLOCKAGE: '🚰 Drain Blockage', FALLEN_TREE: '🌳 Fallen Tree',
  ABANDONED_VEHICLE: '🚗 Abandoned Vehicle', AIR_POLLUTION: '🌫️ Air Pollution',
  OTHER: '📋 Other',
};

// ─── Cloudinary Upload ────────────────────────────────────────────────────────

async function uploadFileToCloudinary(file, signatureData) {
  const { signature, timestamp, folder, cloud_name, api_key } = signatureData;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', api_key);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
    { method: 'POST', body: formData }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Upload failed');
  return data.secure_url;
}

// ─── Proximity Helper ────────────────────────────────────────────────────────

/** Haversine formula — returns distance in metres between two lat/lng points */
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Embedded Site Map ───────────────────────────────────────────────────────────

/**
 * Compact Leaflet map pinned at the issue location.
 * Scroll-wheel zoom disabled to avoid hijacking page scroll.
 */
function SiteMap({ lat, lng, shortId, address }) {
  if (!lat || !lng) return null;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="fw-work-section">
      <p className="fw-work-label">🗺️ Work Site Map</p>
      <div className="fw-map-shell">
        <MapContainer
          center={[lat, lng]}
          zoom={16}
          scrollWheelZoom={false}
          zoomControl={true}
          style={{ height: '220px', width: '100%', borderRadius: '10px 10px 0 0' }}
          className="fw-map-container"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[lat, lng]} icon={SITE_ICON}>
            <Popup>
              <strong>{shortId}</strong><br />
              {address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
            </Popup>
          </Marker>
        </MapContainer>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fw-map-nav-link"
        >
          🧭 Navigate to site (Google Maps)
        </a>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    ASSIGNED: { cls: 'fw-status-assigned', label: '⏳ Assigned' },
    IN_PROGRESS: { cls: 'fw-status-in_progress', label: '🔧 In Progress' },
    RESOLVED: { cls: 'fw-status-resolved', label: '✅ Resolved' },
  };
  const s = map[status] || { cls: '', label: status };
  return <span className={`fw-status ${s.cls}`}>{s.label}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IssueWorkPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [localStatus, setLocalStatus] = useState(null);

  // Camera + geo state
  //   geoStatus: 'idle' | 'checking' | 'nearby' | 'far' | 'denied' | 'error'
  const [geoStatus, setGeoStatus] = useState('idle');
  const [distanceM, setDistanceM] = useState(null);   // metres from site
  const [fetchedCoords, setFetchedCoords] = useState(null); // { lat, lng, accuracy }
  const [cameraOn, setCameraOn] = useState(false);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Captured frames (for Cloudinary upload on resolve)
  const [previewFiles, setPreviewFiles] = useState([]); // { file:Blob, objectUrl }

  // Resolve state
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [resolveError, setResolveError] = useState('');

  // ── Load issue detail ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    apiConnector('GET', endpoints.FW_ISSUE_DETAIL_API(id))
      .then((res) => {
        setData(res);
        setLocalStatus(res.issue.status);
      })
      .catch((err) => {
        console.error('[IssueWorkPage] load error:', err);
        if (err.status === 404) navigate('/field-worker', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  // ── Auto-start: transition ASSIGNED → IN_PROGRESS on page open ──────────────
  useEffect(() => {
    if (!data || data.issue.status !== 'ASSIGNED' || starting) return;

    setStarting(true);
    apiConnector('PATCH', endpoints.FW_START_API(id))
      .then(() => {
        setLocalStatus('IN_PROGRESS');
        // Also update the issue object in data so images section shows correct status
        setData((prev) => ({
          ...prev,
          issue: { ...prev.issue, status: 'IN_PROGRESS' },
        }));
      })
      .catch((err) => {
        // If it's already IN_PROGRESS (409/400) that's fine — just continue
        console.warn('[IssueWorkPage] start issue:', err?.data?.message);
      })
      .finally(() => setStarting(false));
  }, [data, id, starting]);

  // ── Stop camera stream helper (called on unmount + close) ───────────────────
  const stopStream = useCallback((s) => {
    if (s) s.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    return () => stopStream(stream); // cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // ── Open camera stream ────────────────────────────────────────────────────────────
  async function openCamera() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play();
        }
      }, 100);
    } catch (camErr) {
      console.error('[camera]', camErr);
      setGeoStatus('error');
    }
  }

  // ── Check proximity → open camera ────────────────────────────────────────────
  async function verifyAndOpenCamera() {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('checking');
    setFetchedCoords(null);
    setDistanceM(null);

    let bestPos = null;
    let watchId = null;
    let timeoutId = null;

    const clearActiveWatch = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };

    const processPosition = async (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      
      // If we don't have a best position yet, or if this one has better accuracy (smaller accuracy value)
      if (!bestPos || accuracy < bestPos.coords.accuracy) {
        bestPos = pos;
        
        const dist = haversineMetres(
          latitude, longitude,
          Number(data.issue.lat), Number(data.issue.lng)
        );

        setDistanceM(Math.round(dist));
        setFetchedCoords({
          lat: latitude,
          lng: longitude,
          accuracy: Math.round(accuracy)
        });

        // If the accuracy is already excellent (< 25m), lock it in immediately and stop watching
        if (accuracy <= 25) {
          clearActiveWatch();
          await finalizeProximityCheck(pos);
        }
      }
    };

    const handleGeoError = (err) => {
      console.warn('[geolocation watch error]', err);
      if (bestPos) {
        clearActiveWatch();
        finalizeProximityCheck(bestPos);
      } else {
        clearActiveWatch();
        setGeoStatus(err.code === 1 ? 'denied' : 'error');
      }
    };

    // Start watching the location so it refines the accuracy
    watchId = navigator.geolocation.watchPosition(processPosition, handleGeoError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    // Give it up to 5.5 seconds to refine the GPS accuracy, then use the best one obtained
    timeoutId = setTimeout(async () => {
      clearActiveWatch();
      if (bestPos) {
        await finalizeProximityCheck(bestPos);
      } else {
        // Ultimate fallback: single quick try without strict high accuracy constraints
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await finalizeProximityCheck(pos);
          },
          (err) => {
            setGeoStatus(err.code === 1 ? 'denied' : 'error');
          },
          { enableHighAccuracy: false, timeout: 5000 }
        );
      }
    }, 5500);
  }

  async function finalizeProximityCheck(pos) {
    const dist = haversineMetres(
      pos.coords.latitude, pos.coords.longitude,
      Number(data.issue.lat), Number(data.issue.lng)
    );
    const distRounded = Math.round(dist);
    const accuracyRounded = Math.round(pos.coords.accuracy);

    setDistanceM(distRounded);
    setFetchedCoords({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: accuracyRounded
    });

    // We allow matching if:
    // 1. Worker is within PROXIMITY_RADIUS (200m)
    // 2. Or the distance minus the GPS inaccuracy falls within the radius (dist - accuracy <= 200m)
    // 3. Or the distance is less than 300m threshold (account for urban block sizes)
    const withinAllowedLimit = dist <= PROXIMITY_RADIUS || (dist - pos.coords.accuracy) <= PROXIMITY_RADIUS || dist <= 300;

    if (withinAllowedLimit) {
      setGeoStatus('nearby');
      await openCamera();
    } else {
      setGeoStatus('far');
    }
  }

  // ── Close camera ─────────────────────────────────────────────────────────────
  function closeCamera() {
    stopStream(stream);
    setStream(null);
    setCameraOn(false);
    setGeoStatus('idle');
  }

  // ── Capture frame from live video ────────────────────────────────────────────
  function captureFrame() {
    if (!videoRef.current || !canvasRef.current) return;
    if (previewFiles.length >= 5) { alert('Maximum 5 photos allowed.'); return; }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      setPreviewFiles((prev) => [...prev, { file: blob, objectUrl }]);
    }, 'image/jpeg', 0.88);
  }

  function removePreview(index) {
    setPreviewFiles((prev) => {
      URL.revokeObjectURL(prev[index].objectUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  // ── Mark as Resolved ─────────────────────────────────────────────────────────
  async function handleResolve() {
    setResolveError('');
    setUploading(true);

    try {
      let image_urls = [];

      // 1. Upload resolution images to Cloudinary if any
      if (previewFiles.length > 0) {
        const sigRes = await apiConnector('GET', endpoints.UPLOAD_SIGNATURE_API);

        image_urls = await Promise.all(
          previewFiles.map(({ file }) => uploadFileToCloudinary(file, sigRes))
        );
      }

      // 2. Call resolve endpoint
      await apiConnector('PATCH', endpoints.FW_RESOLVE_API(id), {
        image_urls,
        note: note.trim() || null,
      });

      // 3. Update local state to show resolved banner
      setLocalStatus('RESOLVED');
      setData((prev) => ({
        ...prev,
        issue: { ...prev.issue, status: 'RESOLVED' },
      }));
      setPreviewFiles([]);
      setNote('');
    } catch (err) {
      setResolveError(err?.data?.message || err.message || 'Failed to resolve issue.');
    } finally {
      setUploading(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fw-work-page">
        <div className="fw-loading">
          <span className="spinner" style={{ width: 22, height: 22 }} /> Loading issue…
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { issue, images, watcher_count } = data;
  const status = localStatus || issue.status;
  const isResolved = status === 'RESOLVED';

  const reportImages = images.filter((img) => img.image_type === 'REPORT');
  const resolutionImages = images.filter((img) => img.image_type === 'RESOLUTION');

  return (
    <div className="fw-work-page">
      {/* ── Header ── */}
      <div className="fw-work-header">
        <button className="fw-back-btn" onClick={() => navigate('/field-worker')}>
          ← Back
        </button>
        <span className="fw-work-short-id">{issue.short_id}</span>
        <StatusBadge status={status} />
        {starting && (
          <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>
            Starting…
          </span>
        )}
      </div>

      <div className="fw-work-body">

        {/* ── Title ── */}
        <div style={{ marginBottom: 20 }}>
          <p className="fw-work-short-id" style={{ marginBottom: 4 }}>
            {CATEGORY_LABELS[issue.category] || issue.category}
          </p>
          <h1 className="fw-work-category">
            {issue.assigned_admin_designation
              ? `Routed to: ${issue.assigned_admin_designation}`
              : issue.short_id}
          </h1>
        </div>

        {/* ── Meta chips ── */}
        <div className="fw-work-meta">
          <div className="fw-meta-chip">
            👥 <strong>{watcher_count}</strong>&nbsp;following
          </div>
          <div className="fw-meta-chip">
            ⬆ <strong>{issue.priority_score}</strong>&nbsp;priority
          </div>
          <div className="fw-meta-chip">
            📅 {new Date(issue.created_at).toLocaleDateString('en-IN')}
          </div>
        </div>

        {/* ── Address ── */}
        {issue.address && (
          <div className="fw-work-section">
            <p className="fw-work-label">📍 Location</p>
            <p className="fw-work-text fw-work-address">{issue.address}</p>
          </div>
        )}

        {/* ── Embedded map ── */}
        <SiteMap
          lat={issue.lat}
          lng={issue.lng}
          shortId={issue.short_id}
          address={issue.address}
        />

        {/* ── Description ── */}
        {issue.description && (
          <div className="fw-work-section">
            <p className="fw-work-label">📋 Description</p>
            <p className="fw-work-text">{issue.description}</p>
          </div>
        )}

        {/* ── Report images (citizen evidence) ── */}
        {reportImages.length > 0 && (
          <div className="fw-work-section">
            <p className="fw-work-label">📸 Reported by Citizens ({reportImages.length})</p>
            <div className="fw-img-grid">
              {reportImages.map((img) => (
                <div key={img.id}>
                  <img
                    className="fw-img-thumb"
                    src={img.image_url}
                    alt="Report evidence"
                    onClick={() => window.open(img.image_url, '_blank')}
                    style={{ cursor: 'pointer' }}
                  />
                  <p className="fw-img-tag report">Evidence</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Resolution images (already uploaded) ── */}
        {resolutionImages.length > 0 && (
          <div className="fw-work-section">
            <p className="fw-work-label">✅ Resolution Photos ({resolutionImages.length})</p>
            <div className="fw-img-grid">
              {resolutionImages.map((img) => (
                <div key={img.id}>
                  <img
                    className="fw-img-thumb"
                    src={img.image_url}
                    alt="Resolution"
                    onClick={() => window.open(img.image_url, '_blank')}
                    style={{ cursor: 'pointer' }}
                  />
                  <p className="fw-img-tag resolution">Resolved</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <hr className="fw-divider" />

        {/* ── Resolved state ── */}
        {isResolved ? (
          <div className="fw-resolved-banner">
            ✅ This issue has been marked as Resolved.
            {issue.resolved_at && (
              <p style={{ fontSize: '0.75rem', marginTop: 4, opacity: 0.7 }}>
                {new Date(issue.resolved_at).toLocaleString('en-IN')}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* ── Proximity-gated camera capture ── */}
            <div className="fw-work-section">
              <p className="fw-work-label">📷 Capture Site Photos (camera only · max 5)</p>

              {/* State: idle — show verify button */}
              {geoStatus === 'idle' && (
                <button className="fw-geo-btn" onClick={verifyAndOpenCamera}>
                  📍 Verify Location &amp; Open Camera
                </button>
              )}

              {/* State: checking */}
              {geoStatus === 'checking' && (
                <div className="fw-geo-info checking">
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  Checking your location…
                </div>
              )}

              {/* State: too far */}
              {geoStatus === 'far' && (
                <div className="fw-geo-info far">
                  <p>📍 You are <strong>{distanceM} m</strong> from the work site.</p>
                  {fetchedCoords && (
                    <p style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: 8, lineHeight: 1.3 }}>
                      Detected: {fetchedCoords.lat.toFixed(5)}, {fetchedCoords.lng.toFixed(5)} (±{fetchedCoords.accuracy}m accuracy)
                    </p>
                  )}
                  <p>You must be within <strong>{PROXIMITY_RADIUS} m</strong> to capture photos.</p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button className="fw-geo-retry" onClick={() => setGeoStatus('idle')}>Try Again</button>
                    <button
                      className="fw-geo-override"
                      onClick={async () => {
                        setGeoStatus('nearby');
                        await openCamera();
                      }}
                      style={{
                        background: 'rgba(251, 191, 36, 0.12)',
                        border: '1px solid rgba(251, 191, 36, 0.35)',
                        color: '#fbbf24',
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}
                    >
                      ⚠️ Override (GPS Drift)
                    </button>
                  </div>
                </div>
              )}

              {/* State: denied */}
              {geoStatus === 'denied' && (
                <div className="fw-geo-info far">
                  <p>🚫 Location permission denied.</p>
                  <p>Enable location access in your browser settings, then try again.</p>
                  <button className="fw-geo-retry" onClick={() => setGeoStatus('idle')}>Retry</button>
                </div>
              )}

              {/* State: generic error */}
              {geoStatus === 'error' && (
                <div className="fw-geo-info far">
                  <p>⚠️ Could not access location or camera.</p>
                  <button className="fw-geo-retry" onClick={() => setGeoStatus('idle')}>Retry</button>
                </div>
              )}

              {/* State: nearby — live camera viewfinder */}
              {cameraOn && (
                <div className="fw-camera-shell">
                  <div className="fw-camera-badge">📍 {distanceM} m from site · Camera active</div>
                  <video
                    ref={videoRef}
                    className="fw-camera-video"
                    autoPlay
                    playsInline
                    muted
                  />
                  {/* Hidden canvas for frame capture */}
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div className="fw-camera-controls">
                    <button
                      className="fw-shutter-btn"
                      onClick={captureFrame}
                      disabled={previewFiles.length >= 5}
                      title="Capture photo"
                    >
                      📸
                    </button>
                    <span className="fw-shutter-count">{previewFiles.length}/5</span>
                    <button className="fw-camera-close" onClick={closeCamera}>✕ Close</button>
                  </div>
                </div>
              )}

              {/* Captured previews */}
              {previewFiles.length > 0 && (
                <div className="fw-preview-grid" style={{ marginTop: 12 }}>
                  {previewFiles.map((p, i) => (
                    <div key={i} className="fw-preview-item">
                      <img className="fw-preview-img" src={p.objectUrl} alt={`Capture ${i + 1}`} />
                      <button className="fw-preview-remove" onClick={() => removePreview(i)} title="Remove">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Note ── */}
            <div className="fw-work-section">
              <p className="fw-work-label">📝 Completion Note (optional)</p>
              <textarea
                className="fw-note-area"
                placeholder="Describe what was done, materials used, observations…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            </div>

            {/* ── Error ── */}
            {resolveError && (
              <p style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: 12 }}>
                ⚠️ {resolveError}
              </p>
            )}

            {/* ── Resolve button ── */}
            <button
              className="fw-resolve-btn"
              onClick={handleResolve}
              disabled={uploading || status !== 'IN_PROGRESS'}
            >
              {uploading
                ? `⏳ ${previewFiles.length > 0 ? 'Uploading photos…' : 'Saving…'}`
                : '✅ Mark as Resolved'}
            </button>

            {status === 'ASSIGNED' && !starting && (
              <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', textAlign: 'center', marginTop: 8 }}>
                Issue must be In Progress before resolving. Starting…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
