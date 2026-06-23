import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;   // seconds

export default function VerifyEmail() {
  const { login }    = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();

  // Email passed from Register or Login (when unverified)
  const emailFromState = location.state?.email || '';
  const fromLogin      = location.state?.fromLogin || false;

  const [email, setEmail]         = useState(emailFromState);
  const [digits, setDigits]       = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [serverErr, setServerErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [digitsError, setDigitsError] = useState(false);

  const inputsRef = useRef([]);
  const timerRef  = useRef(null);

  // ── Countdown timer ───────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timerRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const resetTimer = () => {
    clearInterval(timerRef.current);
    setCountdown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timerRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  // ── OTP digit input handlers ───────────────────────────────────────────
  function handleDigitChange(index, value) {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next  = [...digits];
    next[index] = digit;
    setDigits(next);
    setDigitsError(false);
    setServerErr('');

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    // Auto-submit when all filled
    if (next.every((d) => d !== '') && digit) {
      submitOtp(next.join(''));
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Move to previous on backspace when current is empty
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pasted.length === OTP_LENGTH) {
      const next = pasted.split('');
      setDigits(next);
      inputsRef.current[OTP_LENGTH - 1]?.focus();
      submitOtp(pasted);
    }
  }

  // ── Verify OTP ────────────────────────────────────────────────────────
  const submitOtp = useCallback(async (code) => {
    if (!email) { setServerErr('Email is missing. Please go back and try again.'); return; }
    if (code.length !== OTP_LENGTH) return;

    setLoading(true);
    setServerErr('');

    try {
      const res = await api.post('/auth/verify-email', { email, code });
      login(res.data);                   // tokens returned on verify
      navigate('/map', { replace: true });
    } catch (err) {
      setDigitsError(true);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();

      const msg = err.response?.data?.message || 'Invalid or expired code. Try again.';
      setServerErr(msg);
    } finally {
      setLoading(false);
    }
  }, [email, login, navigate]);

  function handleManualSubmit(e) {
    e.preventDefault();
    submitOtp(digits.join(''));
  }

  // ── Resend OTP ────────────────────────────────────────────────────────
  async function handleResend() {
    if (countdown > 0 || resending) return;
    setResending(true);
    setServerErr('');

    try {
      await api.post('/auth/resend-otp', { email });
      setSuccessMsg('A new code has been sent to your email.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
      resetTimer();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setServerErr(err.response?.data?.message || 'Failed to resend code. Try again.');
    } finally {
      setResending(false);
    }
  }

  const otp = digits.join('');
  const isFilled = otp.length === OTP_LENGTH;

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="auth-page">
      {/* ── Left panel ── */}
      <div className="auth-panel-left">
        <div className="auth-brand">
          <div className="auth-brand-icon">🏙️</div>
          <h1>Nagar<span>Seva</span></h1>
          <p>One more step — verify your email to activate your account.</p>
        </div>

        <div className="auth-features">
          <div className="auth-feature-item">
            <span className="auth-feature-icon">🔒</span>
            <div className="auth-feature-text">
              <strong>Secure Verification</strong>
              <span>6-digit code sent to your email</span>
            </div>
          </div>
          <div className="auth-feature-item">
            <span className="auth-feature-icon">⏱️</span>
            <div className="auth-feature-text">
              <strong>Code Expires in 10 min</strong>
              <span>Request a new one if it expires</span>
            </div>
          </div>
          <div className="auth-feature-item">
            <span className="auth-feature-icon">📬</span>
            <div className="auth-feature-text">
              <strong>Check Spam Folder</strong>
              <span>Sometimes it ends up there</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="auth-panel-right">
        <div className="auth-form-container">
          {/* Step indicator */}
          <div className="step-indicator">
            <div className="step-dot done" />
            <div className="step-dot active" />
          </div>

          <div className="auth-form-header">
            <h2>Verify your email</h2>
            <p>
              {fromLogin
                ? 'Your account needs verification. We'
                : 'We'}&nbsp;sent a 6-digit code to{' '}
              <strong style={{ color: 'var(--accent)' }}>{email || 'your email'}</strong>
            </p>
          </div>

          {/* Alerts */}
          {serverErr && (
            <div className="auth-alert error" style={{ marginBottom: 20 }}>
              <span>⚠️</span>
              <span>{serverErr}</span>
            </div>
          )}
          {successMsg && (
            <div className="auth-alert success" style={{ marginBottom: 20 }}>
              <span>✅</span>
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit}>
            {/* OTP digit boxes */}
            <div className="otp-inputs" style={{ marginBottom: 28 }} onPaste={handlePaste}>
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputsRef.current[idx] = el)}
                  className={`otp-digit${digit ? ' filled' : ''}${digitsError ? ' error' : ''}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  disabled={loading}
                  autoFocus={idx === 0}
                  aria-label={`Digit ${idx + 1} of ${OTP_LENGTH}`}
                />
              ))}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="btn-primary"
              disabled={!isFilled || loading}
            >
              {loading ? (
                <>
                  <span className="btn-spinner" />
                  Verifying...
                </>
              ) : (
                '✅ Verify & Continue'
              )}
            </button>
          </form>

          {/* Resend section */}
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {countdown > 0 ? (
              <p className="otp-timer">
                Resend code in <strong>{countdown}s</strong>
              </p>
            ) : (
              <p className="otp-timer">Didn&apos;t receive the code?</p>
            )}
            <button
              className="otp-resend-btn"
              onClick={handleResend}
              disabled={countdown > 0 || resending}
            >
              {resending ? 'Sending...' : 'Resend verification code'}
            </button>
          </div>

          {/* Wrong email? */}
          <div className="auth-footer" style={{ marginTop: 24 }}>
            Wrong email? <Link to="/register">Go back</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
