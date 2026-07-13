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
 *  7. Redesigned to pure Tailwind CSS.
 */
import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { setLocation } from '../../slices/complaintSlice';
import { FiLoader, FiCheckCircle, FiAlertTriangle, FiMapPin, FiCompass } from 'react-icons/fi';

// Fix Leaflet's default icon paths broken by Vite bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM   = 5;
const LOCATED_ZOOM   = 16;

function PinDropHandler({ onPinDrop }) {
  useMapEvents({
    click(e) {
      onPinDrop({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FlyToLocation({ center, zoom }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center) {
      map.flyTo([center.lat, center.lng], zoom, { duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

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
  const [flyTarget,   setFlyTarget]   = useState(null);
  const mapRef = useRef(null);

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
        setFlyTarget(loc);
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
    if (!userAddress.trim()) {
      setUserAddress(addr || '');
    }
    const finalAddress = userAddress.trim() || addr || '';
    dispatch(setLocation({ ...loc, address: finalAddress, userAddress: finalAddress }));
  }

  function handleAddressChange(e) {
    const val = e.target.value;
    setUserAddress(val);
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
      const finalAddr = userAddress.trim() || autoAddress || '';
      dispatch(setLocation({ lat: pin.lat, lng: pin.lng, address: finalAddr, userAddress: userAddress }));
      onNext();
    }
  }

  return (
    <div>
      {/* Heading row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Pin the Location</h2>
          <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
            {geoStatus === 'denied'
              ? 'Location denied. Navigate the map and click to drop a pin.'
              : "Map centred on your position. Click anywhere to refine."}
          </p>
        </div>
        {/* GPS status pill */}
        <div className="shrink-0">
          {geoStatus === 'pending' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold uppercase tracking-wide">
              <FiLoader className="w-3 h-3 animate-spin" /> Locating
            </span>
          )}
          {geoStatus === 'granted' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold uppercase tracking-wide">
              <FiCheckCircle className="w-3 h-3" /> GPS Active
            </span>
          )}
          {geoStatus === 'denied' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold uppercase tracking-wide">
              <FiAlertTriangle className="w-3 h-3" /> GPS Off
            </span>
          )}
        </div>
      </div>

      {/* Leaflet Map */}
      <div className="w-full h-64 border border-gray-200 rounded-sm overflow-hidden mt-4 shadow-sm relative z-0">
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

      {/* Detected address row */}
      {pin && (
        <div className="mt-4 border border-gray-200 rounded-sm">
          {/* Auto-detected row */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide w-20 shrink-0">Detected</span>
            <span className="text-[11px] font-semibold text-gray-700 flex-1">
              {geocoding ? (
                <span className="flex items-center gap-1.5 text-gray-400">
                  <FiLoader className="w-3 h-3 animate-spin" /> Detecting address…
                </span>
              ) : (autoAddress ?? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`)}
            </span>
            <FiCompass className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          </div>

          {/* Editable address row */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide w-20 shrink-0">Address</span>
            <input
              id="address-input"
              type="text"
              className="flex-1 text-[11px] font-semibold text-gray-800 bg-transparent border-none outline-none placeholder-gray-400 py-1"
              placeholder="e.g. Near SBI Bank, MG Road, Ranchi"
              value={userAddress}
              onChange={handleAddressChange}
              maxLength={300}
            />
            {userAddress && <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
          </div>
        </div>
      )}
      {pin && autoAddress && userAddress !== autoAddress && (
        <button
          type="button"
          className="text-[10px] font-bold text-[#1e2a5a] hover:underline mt-1.5 cursor-pointer block"
          onClick={handleUseDetected}
        >
          ↩ Use detected address
        </button>
      )}

      <div className="flex justify-between pt-5 mt-4 border-t border-gray-100">
        <button
          id="complaint-step2-back"
          className="px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-sm border border-gray-200 transition cursor-pointer"
          onClick={onBack}
        >
          ← Back
        </button>
        <button
          id="complaint-step2-next"
          className="px-6 py-2.5 bg-[#1e2a5a] hover:bg-[#2d3f82] disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-sm transition cursor-pointer"
          onClick={handleNext}
          disabled={!pin}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
