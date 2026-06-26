/**
 * pages/CityPulse.jsx
 *
 * A Google Maps-like experience for browsing civic issues.
 * - Full-screen Leaflet map with viewport-based data fetching
 * - Supercluster-powered clustering (K-D tree)
 * - Floating detail card with "Me too" endorsement
 * - Debounced fetch + AbortController for smooth panning
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useSupercluster from 'use-supercluster';
import 'leaflet/dist/leaflet.css';
import { apiConnector } from '../services/apiConnector';
import { endpoints } from '../services/api';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [20.5937, 78.9629]; // India center
const DEFAULT_ZOOM = 5;

const CATEGORY_ICONS = {
  POTHOLE: '🕳️', STREETLIGHT: '💡', SEWAGE: '🚰', GARBAGE: '🗑️',
  WATER_SUPPLY: '💧', ROAD_DAMAGE: '🛣️', ENCROACHMENT: '🚧',
  STRAY_ANIMALS: '🐕', DEAD_ANIMAL: '💀', PUBLIC_TOILET: '🚻',
  DRAIN_BLOCKAGE: '🚰', FALLEN_TREE: '🌳', ABANDONED_VEHICLE: '🚗',
  AIR_POLLUTION: '🌫️', OTHER: '📋',
};

const STATUS_COLORS = {
  SUBMITTED: '#38bdf8', VERIFIED: '#22c55e', ASSIGNED: '#a855f7',
  IN_PROGRESS: '#f59e0b', RESOLVED: '#22c55e', REOPENED: '#f97316',
};

/** Creates a custom cluster icon */
function createClusterIcon(count) {
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  return L.divIcon({
    html: `<div class="cluster-marker" style="width:${size}px;height:${size}px;"><span>${count}</span></div>`,
    className: 'cluster-marker-wrap',
    iconSize: [size, size],
  });
}

/** Creates a custom issue icon */
function createIssueIcon(category) {
  const emoji = CATEGORY_ICONS[category] || '📋';
  return L.divIcon({
    html: `<div class="issue-marker"><span>${emoji}</span></div>`,
    className: 'issue-marker-wrap',
    iconSize: [32, 32],
  });
}

/** Map event handler — tracks bounds and zoom */
function MapEventHandler({ onBoundsChange }) {
  const map = useMap();

  const reportBounds = useCallback(() => {
    const b = map.getBounds();
    onBoundsChange({
      sw_lng: b.getSouthWest().lng,
      sw_lat: b.getSouthWest().lat,
      ne_lng: b.getNorthEast().lng,
      ne_lat: b.getNorthEast().lat,
      zoom: map.getZoom(),
    });
  }, [map, onBoundsChange]);

  useMapEvents({
    moveend: reportBounds,
    zoomend: reportBounds,
  });

  // Report initial bounds
  useEffect(() => {
    reportBounds();
  }, [reportBounds]);

  return null;
}

/** Fly to user location on mount */
function FlyToUser() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { duration: 1.5 });
      },
      () => { /* denied — stay at default */ },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [map]);
  return null;
}

export default function CityPulse() {
  const navigate = useNavigate();
  const [issues, setIssues]         = useState([]);
  const [bounds, setBounds]         = useState(null);
  const [zoom, setZoom]             = useState(DEFAULT_ZOOM);
  const [selectedIssue, setSelected] = useState(null);
  const [meTooLoading, setMeTooLoading] = useState(false);
  const [endorsedIds, setEndorsedIds]   = useState(new Set()); // Track endorsed issues

  const abortRef = useRef(null);
  const timerRef = useRef(null);

  // Debounced viewport fetch
  const fetchViewport = useCallback((newBounds) => {
    setBounds([newBounds.sw_lng, newBounds.sw_lat, newBounds.ne_lng, newBounds.ne_lat]);
    setZoom(newBounds.zoom);

    if (abortRef.current) abortRef.current.abort();
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      abortRef.current = new AbortController();
      try {
        const params = `sw_lng=${newBounds.sw_lng}&sw_lat=${newBounds.sw_lat}&ne_lng=${newBounds.ne_lng}&ne_lat=${newBounds.ne_lat}`;
        const res = await fetch(`${endpoints.VIEWPORT_ISSUES_API}?${params}`, {
          signal: abortRef.current.signal,
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setIssues(data.data || []);
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[CityPulse] fetch error:', err);
      }
    }, 300);
  }, []);

  // Convert issues to GeoJSON for Supercluster
  const points = issues.map((issue) => ({
    type: 'Feature',
    properties: { cluster: false, ...issue },
    geometry: { type: 'Point', coordinates: [parseFloat(issue.lng), parseFloat(issue.lat)] },
  }));

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds || [-180, -90, 180, 90],
    zoom,
    options: { radius: 75, maxZoom: 17 },
  });

  // "Me too" handler — sends current GPS for proximity validation
  async function handleMeToo(issueId) {
    if (endorsedIds.has(issueId)) return; // Already endorsed locally
    setMeTooLoading(true);
    try {
      // Get current position for proximity validation
      const position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('No GPS'));
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => reject(new Error('Location denied')),
          { timeout: 5000 }
        );
      });

      const res = await apiConnector('POST', endpoints.ME_TOO_API(issueId), null, {
        'X-User-Lat': position.lat.toString(),
        'X-User-Lng': position.lng.toString(),
      });

      // Mark as endorsed regardless of whether it was new or already done
      setEndorsedIds((prev) => new Set(prev).add(issueId));

      // Update local counts if we got new values back
      if (res.report_count) {
        setIssues((prev) =>
          prev.map((i) => i.id === issueId ? { ...i, report_count: res.report_count } : i)
        );
        if (selectedIssue?.id === issueId) {
          setSelected((prev) => ({ ...prev, report_count: res.report_count }));
        }
      }
    } catch (err) {
      const msg = err?.data?.message || err?.message || 'Could not endorse issue';
      // If it's a proximity error, show it; otherwise mark as endorsed to prevent re-clicks
      if (err?.data?.error === 'TOO_FAR' || err?.data?.error === 'LOCATION_REQUIRED') {
        alert(msg);
      } else {
        // SELF_ENDORSE or other — just disable the button
        setEndorsedIds((prev) => new Set(prev).add(issueId));
      }
    } finally {
      setMeTooLoading(false);
    }
  }

  return (
    <div className="citypulse-page">
      {/* Header bar */}
      <div className="citypulse-header">
        <button className="citypulse-back" onClick={() => navigate('/citizen')}>
          ← Back
        </button>
        <h1 className="citypulse-title">City Pulse</h1>
        <span className="citypulse-count">{issues.length} issues in view</span>
      </div>

      {/* Full-screen map */}
      <div className="citypulse-map-wrap">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEventHandler onBoundsChange={fetchViewport} />
          <FlyToUser />

          {/* Render clusters and individual markers */}
          {clusters.map((cluster) => {
            const [lng, lat] = cluster.geometry.coordinates;
            const { cluster: isCluster, point_count: count } = cluster.properties;

            if (isCluster) {
              return (
                <Marker
                  key={`cluster-${cluster.id}`}
                  position={[lat, lng]}
                  icon={createClusterIcon(count)}
                  eventHandlers={{
                    click: () => {
                      const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(cluster.id), 17);
                      // Map will re-fetch via moveend event
                    },
                  }}
                />
              );
            }

            // Individual issue marker
            return (
              <Marker
                key={`issue-${cluster.properties.id}`}
                position={[lat, lng]}
                icon={createIssueIcon(cluster.properties.category)}
                eventHandlers={{
                  click: () => setSelected(cluster.properties),
                }}
              />
            );
          })}
        </MapContainer>

        {/* Floating issue card */}
        {selectedIssue && (
          <div className="citypulse-card">
            <button className="citypulse-card-close" onClick={() => setSelected(null)}>✕</button>

            {selectedIssue.thumbnail && (
              <img className="citypulse-card-img" src={selectedIssue.thumbnail} alt="Issue" />
            )}

            <div className="citypulse-card-body">
              <div className="citypulse-card-top">
                <span className="citypulse-card-id">{selectedIssue.short_id}</span>
                <span
                  className="citypulse-card-status"
                  style={{ color: STATUS_COLORS[selectedIssue.status] || '#64748b' }}
                >
                  {selectedIssue.status}
                </span>
              </div>

              <p className="citypulse-card-category">
                {CATEGORY_ICONS[selectedIssue.category]} {selectedIssue.category?.replace(/_/g, ' ')}
              </p>

              {selectedIssue.description && (
                <p className="citypulse-card-desc">
                  {selectedIssue.description.length > 120
                    ? selectedIssue.description.slice(0, 120) + '…'
                    : selectedIssue.description}
                </p>
              )}

              {selectedIssue.address && (
                <p className="citypulse-card-address">📍 {selectedIssue.address}</p>
              )}

              <div className="citypulse-card-footer">
                <span className="citypulse-card-reports">
                  👥 {selectedIssue.report_count} report{selectedIssue.report_count !== 1 ? 's' : ''}
                </span>
                <button
                  className="citypulse-metoo-btn"
                  onClick={() => handleMeToo(selectedIssue.id)}
                  disabled={meTooLoading || endorsedIds.has(selectedIssue.id)}
                >
                  {endorsedIds.has(selectedIssue.id) ? '✅ Endorsed' : meTooLoading ? '…' : '👍 Me Too'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
