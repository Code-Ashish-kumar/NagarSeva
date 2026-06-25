/**
 * components/complaint/Step3_Description.jsx
 *
 * Responsibilities:
 *  1. Text area for user to describe the issue (20–500 chars).
 *  2. On Next: dispatch description, call /analyze again with full context
 *     (image + description + location) to enrich the AI result, then advance.
 */
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setDescription, setAiResult } from '../../slices/complaintSlice';
import { endpoints } from '../../services/api';
import { apiConnector } from '../../services/apiConnector';

const MIN_CHARS = 20;
const MAX_CHARS = 500;

export default function Step3_Description({ onNext, onBack }) {
  const dispatch = useDispatch();
  const { description: savedDesc, imageBase64, imageMimeType, location } =
    useSelector((s) => s.complaint);

  const [text,    setText]    = useState(savedDesc ?? '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const charCount = text.length;
  const isReady   = charCount >= MIN_CHARS;

  async function handleNext() {
    if (!isReady) return;

    setLoading(true);
    setError(null);
    dispatch(setDescription(text));

    try {
      // Re-run analysis with the full context so AI description is richer
      const result = await apiConnector('POST', endpoints.ANALYZE_COMPLAINT_API, {
        imageBase64,
        mimeType: imageMimeType,
        description: text,
        location,
      });

      dispatch(setAiResult(result));
      onNext();
    } catch (err) {
      const status  = err?.status;
      const message = err?.data?.message || err?.message || '';
      if (status === 429 || message.toLowerCase().includes('rate-limit') || message.toLowerCase().includes('rate limited')) {
        setError('The AI service is temporarily busy. Please wait 30 seconds and try again.');
      } else if (status === 503 || status === 500 || message.includes('404') || message.includes('not found')) {
        setError('Our AI assistant is currently unavailable. Please try again in a moment.');
      } else {
        setError('Our AI assistant couldn\'t analyse your complaint right now. Please try again shortly.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="step-title">Describe the Issue</h2>
      <p className="step-subtitle">
        Tell us about the civic problem in your own words. Include how it affects
        daily life, how long it's been there, or any safety concerns.
      </p>

      <textarea
        id="complaint-description-input"
        className="complaint-textarea"
        placeholder="e.g. There is a large pothole near the bus stop on MG Road that has been there for over two weeks. Two-wheelers have already fallen due to it…"
        maxLength={MAX_CHARS}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        disabled={loading}
        aria-label="Issue description"
      />

      <p className={`char-count${charCount >= MIN_CHARS ? ' ok' : charCount > MAX_CHARS * 0.9 ? ' warn' : ''}`}>
        {charCount}/{MAX_CHARS} characters
        {charCount < MIN_CHARS && ` · ${MIN_CHARS - charCount} more needed`}
      </p>

      {error && (
        <div className="rejection-banner" role="alert" style={{ marginTop: 12 }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
          <p>{error}</p>
        </div>
      )}

      <div className="wizard-nav">
        <button id="complaint-step3-back" className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <button
          id="complaint-step3-next"
          className="btn-next"
          onClick={handleNext}
          disabled={!isReady || loading}
        >
          {loading ? (
            <><span className="spinner" /> Analysing…</>
          ) : (
            <>Generate Review →</>
          )}
        </button>
      </div>
    </div>
  );
}
