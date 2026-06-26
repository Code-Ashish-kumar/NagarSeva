/**
 * components/complaint/Step2_LocationPin.jsx
 *
 * Responsibilities:
 *  1. Request browser geolocation on mount.
 *  2. Render a Leaflet map centred on user position (or default centre of India).
 *  3. Draggable marker — on drag end dispatch setLocation.
 *  4. Reverse-geocode via Nominatim for a suggested address.
 *  5. Editable address field for user to refine/enter manually.
 *  6. "Next" is disabled until a pin has been placed.
 */
import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { setLocation } from '../../slices/complaintSlice';

// Fix Leaflet's default icon paths broken by Vite bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // centre of India
const DEFAULT_ZOOM   = 5;
const LOCATED_ZOOM   = 16;

/** Inner component — uses map events hook (must be inside MapContainer) */
function PinDropHandler({ onPinDrop }) {
  useMapEvents({
    click(e) {
      onPinDrop({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Flies the map to a new center+zoom when props change */
function FlyToLocation({ center, zoom }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center) {
      map.flyTo([center.lat, center.lng], zoom, { duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

/** Reverse-geocode via Nominatim (free, no API key needed) */
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

export default function Step2_LocationPin({ onNext, onBack }) {
  const dispatch = useDispatch();
  const saved    = useSelector((s) => s.complaint.location);

  const [center, setCenter]       = useState(saved ?? DEFAULT_CENTER);
  const [zoom,   setZoom]         = useState(saved ? LOCATED_ZOOM : DEFAULT_ZOOM);
  const [pin,    setPin]          = useState(saved);
  const [geoStatus, setGeoStatus] = useState('pending');
  const [autoAddress, setAutoAddress] = useState(saved?.address ?? null);
  const [userAddress, setUserAddress] = useState(saved?.userAddress ?? '');
  const [geocoding,   setGeocoding]   = useState(false);
  const [flyTarget,   setFlyTarget]   = useState(null);   // { lat, lng } to fly to
  const mapRef = useRef(null);

  // Request geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(loc);
        setZoom(LOCATED_ZOOM);
        setFlyTarget(loc);  // triggers map fly animation
        setGeoStatus('granted');
        handlePinDrop(loc);
      },
      () => {
        setGeoStatus('denied');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePinDrop(loc) {
    setPin(loc);
    setGeocoding(true);
    const addr = await reverseGeocode(loc.lat, loc.lng);
    setAutoAddress(addr);
    setGeocoding(false);
    // Only auto-fill userAddress if it's empty (don't overwrite manual edits)
    if (!userAddress.trim()) {
      setUserAddress(addr || '');
    }
    // Dispatch with whatever address is currently in the input
    const finalAddress = userAddress.trim() || addr || '';
    dispatch(setLocation({ ...loc, address: finalAddress, userAddress: finalAddress }));
  }

  function handleAddressChange(e) {
    const val = e.target.value;
    setUserAddress(val);
    // Update Redux with the user-typed address
    if (pin) {
      dispatch(setLocation({ lat: pin.lat, lng: pin.lng, address: val, userAddress: val }));
    }
  }

  function handleUseDetected() {
    if (autoAddress) {
      setUserAddress(autoAddress);
      if (pin) {
        dispatch(setLocation({ lat: pin.lat, lng: pin.lng, address: autoAddress, userAddress: autoAddress }));
      }
    }
  }

  function handleNext() {
    if (pin) {
      // Final sync of address to Redux before advancing
      const finalAddr = userAddress.trim() || autoAddress || '';
      dispatch(setLocation({ lat: pin.lat, lng: pin.lng, address: finalAddr, userAddress: userAddress }));
      onNext();
    }
  }

  return (
    <div>
      <h2 className="step-title">Pin the Location</h2>
      <p className="step-subtitle">
        {geoStatus === 'denied'
          ? 'Location access was denied. Navigate the map and click to drop a pin.'
          : "We've centred the map on your position. Click anywhere to refine the pin."}
      </p>

      {/* Geolocation status */}
      <div className="location-status">
        {geoStatus === 'pending' && <><span className="spinner" style={{ borderTopColor: 'var(--color-accent)' }} />Locating…</>}
        {geoStatus === 'granted' && <><span style={{ color: 'var(--color-success)' }}>●</span> Location access granted</>}
        {geoStatus === 'denied'  && <><span style={{ color: 'var(--color-warning)' }}>●</span> Location access denied — manual pin required</>}
      </div>

      {/* Leaflet Map */}
      <div className="map-container">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <PinDropHandler onPinDrop={handlePinDrop} />
          {flyTarget && <FlyToLocation center={flyTarget} zoom={LOCATED_ZOOM} />}
          {pin && (
            <Marker
              position={[pin.lat, pin.lng]}
              draggable
              eventHandlers={{
                dragend(e) {
                  const { lat, lng } = e.target.getLatLng();
                  handlePinDrop({ lat, lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Detected address pill */}
      {pin && (
        <div className={`location-pill pinned`}>
          <span>📍</span>
          <span>
            {geocoding ? 'Detecting address…' : (autoAddress ?? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`)}
          </span>
        </div>
      )}

      {/* User-editable address field */}
      {pin && (
        <div className="address-input-wrap">
          <label htmlFor="address-input" className="address-input-label">
            Confirm or edit issue area address
          </label>
          <div className="address-input-row">
            <input
              id="address-input"
              type="text"
              className="address-input"
              placeholder="e.g. Near SBI Bank, MG Road, Sector 5, Lucknow"
              value={userAddress}
              onChange={handleAddressChange}
              maxLength={300}
            />
          </div>
          {autoAddress && userAddress !== autoAddress && (
            <button
              type="button"
              className="address-use-detected"
              onClick={handleUseDetected}
            >
              ↩ Use detected: <span>{autoAddress.length > 60 ? autoAddress.slice(0, 60) + '…' : autoAddress}</span>
            </button>
          )}
          <p className="address-hint">
            💡 A clear landmark or street name helps resolve your issue faster
          </p>
        </div>
      )}

      <div className="wizard-nav">
        <button id="complaint-step2-back" className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <button
          id="complaint-step2-next"
          className="btn-next"
          onClick={handleNext}
          disabled={!pin}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
