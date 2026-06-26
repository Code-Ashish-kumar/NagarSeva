/**
 * components/complaint/Step4_ReviewForm.jsx
 *
 * Displays the read-only AI-generated complaint summary.
 * On "Submit" → uploads images to Cloudinary → creates issue via POST /api/issues.
 * Redirects to /citizen/complaints on success.
 */
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { resetComplaint } from '../../slices/complaintSlice';
import { apiConnector } from '../../services/apiConnector';
import { endpoints } from '../../services/api';

const CATEGORY_LABELS = {
  POTHOLE:             '🕳️  Pothole',
  STREETLIGHT:         '💡 Street Light',
  SEWAGE:              '🚰 Sewage',
  GARBAGE:             '🗑️  Garbage',
  WATER_SUPPLY:        '💧 Water Supply',
  ROAD_DAMAGE:         '🛣️  Road Damage',
  ENCROACHMENT:        '🚧 Encroachment',
  STRAY_ANIMALS:       '🐕 Stray Animals',
  DEAD_ANIMAL:         '💀 Dead Animal',
  PUBLIC_TOILET:       '🚻 Public Toilet',
  DRAIN_BLOCKAGE:      '🚰 Drain Blockage',
  FALLEN_TREE:         '🌳 Fallen Tree',
  ABANDONED_VEHICLE:   '🚗 Abandoned Vehicle',
  AIR_POLLUTION:       '🌫️  Air Pollution',
  OTHER:               '📋 Other',
};

function EditLink({ label, stepIndex, onGoToStep }) {
  return (
    <button
      className="review-edit-link"
      onClick={() => onGoToStep(stepIndex)}
      title={`Edit ${label}`}
      aria-label={`Edit ${label}`}
    >
      ✎ Edit
    </button>
  );
}

function SeverityBadge({ severity }) {
  const icons = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };
  return (
    <span className={`severity-badge severity-${severity}`}>
      {icons[severity] ?? '⬜'} {severity}
    </span>
  );
}

/**
 * Upload a single base64 image to Cloudinary using a signed upload.
 */
async function uploadToCloudinary(base64, mimeType, signatureData) {
  const { signature, timestamp, folder, cloud_name, api_key } = signatureData;

  const dataUri = `data:${mimeType};base64,${base64}`;

  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('api_key', api_key);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[Cloudinary upload error]', data);
    throw new Error(data?.error?.message || 'Image upload failed');
  }

  return data.secure_url;
}

function MergeNotification({ mergedIssue, onViewComplaints }) {
  return (
    <div className="merge-notification" role="alert">
      <div className="merge-notification-icon">✅</div>
      <h2 className="merge-notification-title">
        Your report has been added to an existing tracked issue!
      </h2>
      <p className="merge-notification-detail">
        <strong>Issue:</strong> {mergedIssue.issue.short_id}
      </p>
      <p className="merge-notification-detail">
        This problem has been reported by {mergedIssue.report_count} citizens. 
        Your photos have been added and its priority has been boosted.
      </p>
      <button
        className="btn-next"
        onClick={onViewComplaints}
        style={{ marginTop: 16, maxWidth: 280 }}
      >
        View My Complaints
      </button>
    </div>
  );
}

export default function Step4_ReviewForm({ onBack, onGoToStep }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { aiResult, images, location, description } =
    useSelector((s) => s.complaint);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [mergedIssue, setMergedIssue] = useState(null);

  if (!aiResult) return null;

  if (mergedIssue) {
    return (
      <MergeNotification
        mergedIssue={mergedIssue}
        onViewComplaints={() => {
          dispatch(resetComplaint());
          navigate('/citizen/complaints', { replace: true });
        }}
      />
    );
  }

  const confidencePct = Math.round((aiResult.confidence ?? 0) * 100);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      // 1. Get Cloudinary signature
      const sigData = await apiConnector('GET', endpoints.UPLOAD_SIGNATURE_API);

      // 2. Upload all images to Cloudinary
      const uploadPromises = images.map((img) =>
        uploadToCloudinary(img.base64, img.mimeType, sigData)
      );
      const imageUrls = await Promise.all(uploadPromises);

      // 3. Create issue in backend
      const result = await apiConnector('POST', endpoints.CREATE_ISSUE_API, {
        category: aiResult.category,
        description: description || aiResult.ai_description,
        lat: location.lat,
        lng: location.lng,
        address: location.address || '',
        image_urls: imageUrls,
      });

      // 4. Check if merged or new
      if (result.merged) {
        // Store merged issue data for MergeNotification
        setMergedIssue(result);
      } else {
        // Existing flow: reset wizard and navigate to complaints list
        dispatch(resetComplaint());
        navigate('/citizen/complaints', { replace: true });
      }

    } catch (err) {
      const message = err?.data?.message || err?.message || '';
      setError(message || 'Failed to submit complaint. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="step-title">Review Your Complaint</h2>
      <p className="step-subtitle">
        This form has been auto-filled by AI based on your image, location, and
        description. It is <strong>read-only</strong>. Use&nbsp;
        <em>Edit</em> links to go back and change a specific input.
      </p>

      <div className="review-grid">

        {/* Image thumbnails */}
        <div className="review-field">
          <p className="review-field-label">Evidence Photos ({images.length})</p>
          <EditLink label="Image" stepIndex={1} onGoToStep={onGoToStep} />
          <div className="review-images-row" style={{ marginTop: 8 }}>
            {images.map((img, idx) => (
              <img
                key={idx}
                className="review-image-thumb-small"
                src={img.previewUrl}
                alt={`Evidence ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="review-field">
          <p className="review-field-label">Category</p>
          <EditLink label="Image" stepIndex={1} onGoToStep={onGoToStep} />
          <p className="review-field-value">
            {CATEGORY_LABELS[aiResult.category] ?? aiResult.category}
          </p>
        </div>

        {/* Severity */}
        <div className="review-field">
          <p className="review-field-label">Severity</p>
          <EditLink label="Image" stepIndex={1} onGoToStep={onGoToStep} />
          <div style={{ marginTop: 6 }}>
            <SeverityBadge severity={aiResult.severity} />
          </div>
        </div>

        {/* AI Confidence */}
        <div className="review-field">
          <p className="review-field-label">AI Confidence</p>
          <p className="review-field-value">{confidencePct}%</p>
          <div className="confidence-bar-wrap">
            <div className="confidence-bar">
              <div className="confidence-fill" style={{ width: `${confidencePct}%` }} />
            </div>
          </div>
        </div>

        {/* AI Title */}
        <div className="review-field">
          <p className="review-field-label">Issue Title (AI-Generated)</p>
          <EditLink label="Image or Description" stepIndex={3} onGoToStep={onGoToStep} />
          <p className="review-field-value">{aiResult.title}</p>
        </div>

        {/* AI Description */}
        <div className="review-field">
          <p className="review-field-label">AI Description</p>
          <EditLink label="Image or Description" stepIndex={3} onGoToStep={onGoToStep} />
          <p className="review-field-value">{aiResult.ai_description}</p>
        </div>

        {/* Location */}
        <div className="review-field">
          <p className="review-field-label">Location</p>
          <EditLink label="Location" stepIndex={2} onGoToStep={onGoToStep} />
          <p className="review-field-value" style={{ fontSize: '0.85rem' }}>
            {location?.address || `${location?.lat?.toFixed(6)}, ${location?.lng?.toFixed(6)}`}
          </p>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', marginTop: 4 }}>
            {location?.lat?.toFixed(6)}°N, {location?.lng?.toFixed(6)}°E
          </p>
        </div>

        {/* User Description */}
        <div className="review-field">
          <p className="review-field-label">Your Description</p>
          <EditLink label="Description" stepIndex={3} onGoToStep={onGoToStep} />
          <p className="review-field-value" style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
            {description}
          </p>
        </div>

      </div>

      {/* Error banner */}
      {error && (
        <div className="rejection-banner" role="alert" style={{ marginTop: 16 }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        className="btn-next"
        onClick={handleSubmit}
        disabled={submitting}
        style={{ marginTop: 24, width: '100%' }}
      >
        {submitting ? (
          <><span className="spinner" /> Submitting…</>
        ) : (
          <>📋 Submit Complaint</>
        )}
      </button>

      {/* Back nav */}
      <div className="wizard-nav" style={{ marginTop: 12 }}>
        <button id="complaint-step4-back" className="btn-back" onClick={onBack} disabled={submitting}>
          ← Back
        </button>
      </div>
    </div>
  );
}
