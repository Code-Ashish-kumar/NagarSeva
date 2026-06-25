/**
 * components/complaint/Step1_ImageCapture.jsx
 *
 * Responsibilities:
 *  1. Detect mobile vs desktop to show camera / file picker.
 *  2. Support multiple images (up to 5).
 *  3. Convert selected files → preview URL + base64.
 *  4. Call POST /api/complaints/analyze (primary image) on Next click.
 *  5. On rejection → show inline banner, wizard does NOT advance.
 *  6. On success → store AI result in Redux, advance to step 2.
 */
import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addImage, removeImage, setAiResult } from '../../slices/complaintSlice';
import { endpoints } from '../../services/api';
import { apiConnector } from '../../services/apiConnector';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const MAX_IMAGES = 5;

/** Convert File → { base64 (no prefix), previewUrl (object URL), mimeType } */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64  = dataUrl.split(',')[1];
      const preview = URL.createObjectURL(file);
      resolve({ base64, preview, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Step1_ImageCapture({ onNext }) {
  const dispatch = useDispatch();
  const { images } = useSelector((s) => s.complaint);

  const fileInputRef = useRef(null);
  const [loading, setLoading]     = useState(false);
  const [rejection, setRejection] = useState(null);

  const hasImages = images.length > 0;
  const canAddMore = images.length < MAX_IMAGES;

  function triggerFilePicker() {
    if (!loading) fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setRejection(null);

    for (const file of files) {
      if (images.length >= MAX_IMAGES) break;
      try {
        const { base64, preview, mimeType } = await readFile(file);
        dispatch(addImage({ previewUrl: preview, base64, mimeType }));
      } catch {
        setRejection('Could not read one of the selected files. Please try a different image.');
      }
    }

    e.target.value = '';
  }

  function handleRemove(idx) {
    dispatch(removeImage(idx));
    setRejection(null);
  }

  async function handleNext() {
    if (!hasImages) return;

    setLoading(true);
    setRejection(null);

    try {
      // Send primary image for initial validation
      const primary = images[0];
      const result = await apiConnector('POST', endpoints.ANALYZE_COMPLAINT_API, {
        imageBase64: primary.base64,
        mimeType: primary.mimeType,
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
          ? 'Take photos of the civic issue using your camera.'
          : 'Upload clear photos of the civic issue from your device.'}
        <br />
        <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
          Up to {MAX_IMAGES} photos · JPG, PNG, WEBP · Max 10MB each
        </span>
      </p>

      {/* Hidden file input — mobile: camera, desktop: gallery (multiple) */}
      <input
        ref={fileInputRef}
        id="complaint-image-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={isMobile ? 'environment' : undefined}
        multiple={!isMobile}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Image grid — show thumbnails when images exist */}
      {hasImages ? (
        <div className="image-grid">
          {images.map((img, idx) => (
            <div key={idx} className="image-grid-item">
              <img src={img.previewUrl} alt={`Evidence ${idx + 1}`} />
              {idx === 0 && <span className="image-primary-badge">Primary</span>}
              <button
                className="image-remove-btn"
                onClick={() => handleRemove(idx)}
                disabled={loading}
                aria-label={`Remove image ${idx + 1}`}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          {/* Add more button */}
          {canAddMore && (
            <div
              className="image-grid-add"
              onClick={triggerFilePicker}
              role="button"
              tabIndex={0}
              aria-label="Add another photo"
              onKeyDown={(e) => e.key === 'Enter' && triggerFilePicker()}
            >
              <span style={{ fontSize: '1.5rem' }}>+</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                Add Photo
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Empty state — drop zone */
        <div
          className="image-drop-zone"
          onClick={triggerFilePicker}
          role="button"
          tabIndex={0}
          aria-label="Click to select images"
          onKeyDown={(e) => e.key === 'Enter' && triggerFilePicker()}
        >
          <div className="drop-icon">{isMobile ? '📷' : '🖼️'}</div>
          <p className="drop-text">
            {isMobile ? 'Tap to open camera' : 'Click to browse files'}
          </p>
          <p className="drop-hint">Ensure the issue is clearly visible</p>
        </div>
      )}

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
          disabled={!hasImages || loading}
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
