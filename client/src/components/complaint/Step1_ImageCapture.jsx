/**
 * components/complaint/Step1_ImageCapture.jsx
 *
 * Responsibilities:
 *  1. Detect mobile vs desktop to show camera / file picker.
 *  2. Convert selected file → preview URL + base64.
 *  3. Call POST /api/complaints/analyze (image only) on Next click.
 *  4. On rejection → show inline banner, wizard does NOT advance.
 *  5. On success → store AI result in Redux, advance to step 2.
 */
import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setImage, setAiResult, setStep } from '../../slices/complaintSlice';
import { endpoints } from '../../services/api';
import { apiConnector } from '../../services/apiConnector';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Convert File → { base64 (no prefix), previewUrl (object URL) } */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl  = e.target.result;                       // "data:image/jpeg;base64,..."
      const base64   = dataUrl.split(',')[1];                 // strip prefix
      const preview  = URL.createObjectURL(file);            // lightweight display URL
      resolve({ base64, preview, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Step1_ImageCapture({ onNext }) {
  const dispatch = useDispatch();
  const { imagePreviewUrl, imageBase64, imageMimeType } = useSelector((s) => s.complaint);

  const fileInputRef = useRef(null);
  const [loading, setLoading]         = useState(false);
  const [rejection, setRejection]     = useState(null);   // string | null

  function triggerFilePicker() {
    if (!loading) fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setRejection(null);

    try {
      const { base64, preview, mimeType } = await readFile(file);
      dispatch(setImage({ imagePreviewUrl: preview, imageBase64: base64, imageMimeType: mimeType }));
    } catch {
      setRejection('Could not read the selected file. Please try a different image.');
    }

    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
  }

  async function handleNext() {
    if (!imageBase64) return;

    setLoading(true);
    setRejection(null);

    try {
      const result = await apiConnector('POST', endpoints.ANALYZE_COMPLAINT_API, {
        imageBase64,
        mimeType: imageMimeType,
        description: '',
        location: null,
      });

      if (!result.is_valid_civic_issue) {
        setRejection(result.rejection_reason || 'The image does not appear to show a civic issue. Please upload a different image.');
        setLoading(false);
        return;
      }

      dispatch(setAiResult(result));
      onNext();
    } catch (err) {
      // Always show a user-friendly message — never expose raw error codes
      const status  = err?.status;
      const message = err?.data?.message || err?.message || '';
      if (status === 429 || message.toLowerCase().includes('rate-limit') || message.toLowerCase().includes('rate limited')) {
        setRejection('The AI service is temporarily busy. Please wait 30 seconds and try again.');
      } else if (status === 503 || status === 500 || message.includes('404') || message.includes('not found')) {
        setRejection('Our AI assistant is currently unavailable. Please try again in a moment.');
      } else {
        setRejection('Our AI assistant couldn\'t process your image right now. Please try again shortly.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="step-title">Capture the Issue</h2>
      <p className="step-subtitle">
        {isMobile
          ? 'Take a photo of the civic issue using your camera.'
          : 'Upload a clear photo of the civic issue from your device.'}
        <br />
        <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
          Supported: JPG, PNG, WEBP · Max 10MB
        </span>
      </p>

      {/* Hidden file input — mobile: camera, desktop: gallery */}
      <input
        ref={fileInputRef}
        id="complaint-image-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={isMobile ? 'environment' : undefined}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Drop zone / preview area */}
      <div
        className={`image-drop-zone${imagePreviewUrl ? ' has-image' : ''}`}
        onClick={triggerFilePicker}
        role="button"
        tabIndex={0}
        aria-label="Click to select an image"
        onKeyDown={(e) => e.key === 'Enter' && triggerFilePicker()}
      >
        {imagePreviewUrl ? (
          <>
            <img src={imagePreviewUrl} alt="Selected complaint" />
            <div className="drop-overlay">
              <span style={{ fontSize: '1.5rem' }}>🔄</span>
              <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>
                {isMobile ? 'Retake Photo' : 'Change Image'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="drop-icon">{isMobile ? '📷' : '🖼️'}</div>
            <p className="drop-text">
              {isMobile ? 'Tap to open camera' : 'Click to browse files'}
            </p>
            <p className="drop-hint">Ensure the issue is clearly visible</p>
          </>
        )}
      </div>

      {/* AI validation loading state */}
      {loading && (
        <div className="ai-validating-overlay" style={{ marginTop: 20 }}>
          <div className="ai-pulse">🤖</div>
          <p style={{ color: 'var(--color-secondary)', fontSize: '0.875rem' }}>
            AI is verifying the image&hellip;
          </p>
        </div>
      )}

      {/* Rejection banner */}
      {rejection && !loading && (
        <div className="rejection-banner" role="alert">
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
          <p>{rejection}</p>
        </div>
      )}

      {/* Nav */}
      <div className="wizard-nav">
        <button
          id="complaint-step1-next"
          className="btn-next"
          onClick={handleNext}
          disabled={!imageBase64 || loading}
          style={{ marginTop: 0 }}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Verifying…
            </>
          ) : (
            <>Verify &amp; Continue →</>
          )}
        </button>
      </div>
    </div>
  );
}
