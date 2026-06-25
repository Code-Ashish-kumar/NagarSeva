/**
 * components/complaint/Step4_ReviewForm.jsx
 *
 * Displays the read-only AI-generated complaint summary.
 * Every field shows an "Edit ✎" back-link that navigates to the relevant step.
 * The "Submit Complaint" button is locked (out-of-scope).
 */
import { useSelector } from 'react-redux';

const CATEGORY_LABELS = {
  ROAD_DAMAGE:           '🛣️  Road Damage',
  WATER_LEAK:            '💧 Water Leak',
  GARBAGE_DUMPING:       '🗑️  Garbage Dumping',
  STREET_LIGHT_FAILURE:  '💡 Street Light Failure',
  DRAINAGE_BLOCKAGE:     '🚰 Drainage Blockage',
  ENCROACHMENT:          '🚧 Encroachment',
  TREE_HAZARD:           '🌳 Tree Hazard',
  SEWAGE_OVERFLOW:       '♻️  Sewage Overflow',
  OTHER:                 '📋 Other',
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

export default function Step4_ReviewForm({ onBack, onGoToStep }) {
  const { aiResult, images, imagePreviewUrl, location, description } =
    useSelector((s) => s.complaint);

  if (!aiResult) return null;

  const confidencePct = Math.round((aiResult.confidence ?? 0) * 100);

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
            {images.length > 0 ? (
              images.map((img, idx) => (
                <img
                  key={idx}
                  className="review-image-thumb-small"
                  src={img.previewUrl}
                  alt={`Evidence ${idx + 1}`}
                />
              ))
            ) : imagePreviewUrl && (
              <img
                className="review-image-thumb"
                src={imagePreviewUrl}
                alt="Complaint evidence"
              />
            )}
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
            {location?.address
              ? location.address
              : `${location?.lat?.toFixed(6)}, ${location?.lng?.toFixed(6)}`}
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

      {/* Locked submit button */}
      <button
        className="submit-locked-btn"
        disabled
        title="Complaint submission is coming soon"
        aria-disabled="true"
      >
        🔒 Submit Complaint — Coming Soon
      </button>

      {/* Back nav */}
      <div className="wizard-nav" style={{ marginTop: 12 }}>
        <button id="complaint-step4-back" className="btn-back" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
