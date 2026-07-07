/**
 * pages/ForgotPassword.jsx
 *
 * Three-step password reset flow:
 *  Step 1: Enter email → checks if registered → sends OTP
 *  Step 2: Enter OTP → verifies it
 *  Step 3: Set new password → resets and redirects to login
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiConnector } from '../services/apiConnector';
import { endpoints } from '../services/api';

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep]               = useState(1);
  const [email, setEmail]             = useState('');
  const [code, setCode]               = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [showRegisterLink, setShowRegisterLink] = useState(false);
  // Step 1: Check if email is registered → send OTP
  async function handleSendOtp(e) {
    e.preventDefault();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiConnector('POST', endpoints.FORGOT_PASSWORD_API, { email: email.toLowerCase().trim() });
      setSuccess(res.message);
      setStep(2);
    } catch (err) {
      if (err?.data?.error === 'NOT_REGISTERED') {
        setError('No account found with this email.');
        setShowRegisterLink(true);
      } else if (err?.data?.error === 'EMAIL_UNVERIFIED') {
        setError('This account is not verified. Please verify your email first.');
      } else {
        setError(err?.data?.message || 'Something went wrong. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify the OTP
  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (code.length !== 6) { setError('Enter the complete 6-digit code.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await apiConnector('POST', endpoints.VERIFY_RESET_OTP_API, {
        email: email.toLowerCase().trim(),
        code,
      });
      setSuccess('Code verified! Set your new password below.');
      setStep(3);
    } catch (err) {
      setError(err?.data?.message || 'Invalid or expired code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Set new password
  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPwd) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await apiConnector('POST', endpoints.RESET_PASSWORD_API, {
        email: email.toLowerCase().trim(),
        code,
        newPassword,
      });
      setSuccess(res.message || 'Password reset! Redirecting to login…');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err?.data?.message || 'Failed to reset password. Please start over.');
    } finally {
      setLoading(false);
    }
  }

  const stepLabels = ['Email', 'Verify', 'New Password'];

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'var(--color-base)' }}>
      <div className="w-full max-w-sm">

        {/* Step indicator */}
        <div className="flex gap-2 mb-6">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex-1 text-center">
              <div
                className="h-1 rounded-full mb-1"
                style={{ background: i + 1 <= step ? 'var(--color-accent)' : 'var(--color-elevated)' }}
              />
              <span className="text-xs" style={{ color: i + 1 <= step ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--color-primary)' }}>
            {step === 1 && 'Forgot Password?'}
            {step === 2 && 'Verify Your Identity'}
            {step === 3 && 'Set New Password'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-secondary)' }}>
            {step === 1 && "Enter your registered email to get a reset code."}
            {step === 2 && `We sent a 6-digit code to ${email}`}
            {step === 3 && 'Choose a strong new password for your account.'}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm mb-5"
            style={{ background: 'var(--color-danger-dim)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}
        {showRegisterLink && (
          <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm mb-5"
            style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(56,189,248,0.2)' }}>
            <span style={{ color: 'var(--color-secondary)', fontSize: '0.85rem' }}>Don't have an account?</span>
            <Link to="/register" className="font-semibold text-sm" style={{ color: 'var(--color-accent)' }}>
              Register now →
            </Link>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm mb-5"
            style={{ background: 'var(--color-success-dim)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>
            <span>✅</span><span>{success}</span>
          </div>
        )}

        {/* Step 1: Email */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none" style={{ color: 'var(--color-muted)' }}>✉️</span>
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); setShowRegisterLink(false); }}
                  disabled={loading}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" />Checking…</> : 'Send Reset Code →'}
            </button>
          </form>
        )}

        {/* Step 2: OTP Verification */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                6-Digit Reset Code
              </label>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="• • • • • •"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                disabled={loading}
                style={{ textAlign: 'center', letterSpacing: '0.4em', fontWeight: 700, fontSize: '1.2rem' }}
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading || code.length !== 6}>
              {loading ? <><span className="spinner" />Verifying…</> : 'Verify Code →'}
            </button>
            <button
              type="button"
              onClick={() => { setStep(1); setError(''); setSuccess(''); setCode(''); }}
              className="text-sm text-center bg-transparent border-none"
              style={{ color: 'var(--color-muted)', cursor: 'pointer' }}
            >
              ← Wrong email? Go back
            </button>
          </form>
        )}

        {/* Step 3: New Password */}
        {step === 3 && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                New Password
              </label>
              <input
                className="form-input"
                type="password"
                placeholder="Min. 8 characters"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Confirm New Password
              </label>
              <input
                className="form-input"
                type="password"
                placeholder="Repeat password"
                value={confirmPwd}
                onChange={(e) => { setConfirmPwd(e.target.value); setError(''); }}
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" />Resetting…</> : '🔒 Reset Password'}
            </button>
          </form>
        )}

        <p className="text-center text-sm mt-7" style={{ color: 'var(--color-secondary)' }}>
          Remember your password?{' '}
          <Link to="/login" className="font-semibold" style={{ color: 'var(--color-accent)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
