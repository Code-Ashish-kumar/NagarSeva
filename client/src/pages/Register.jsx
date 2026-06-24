import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';

function getStrength(password) {
  let score = 0;
  if (password.length >= 8)           score++;
  if (/[A-Z]/.test(password))         score++;
  if (/[0-9]/.test(password))         score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLORS = ['', 'var(--color-danger)', 'var(--color-warning)', 'var(--color-accent)', 'var(--color-success)'];

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPwd, setShowPwd]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [errors, setErrors]           = useState({});
  const [serverErr, setServerErr]     = useState('');

  const pwdStrength = getStrength(form.password);

  function validate() {
    const e = {};
    if (!form.name.trim())               e.name    = 'Full name is required';
    else if (form.name.trim().length < 2) e.name   = 'Name must be at least 2 characters';
    if (!form.email)                     e.email    = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email address';
    if (!form.password)                  e.password = 'Password is required';
    else if (form.password.length < 8)   e.password = 'Password must be at least 8 characters';
    if (!form.confirmPassword)           e.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    return e;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
    setServerErr('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return; }

    setLoading(true);
    setServerErr('');
    try {
      await api.post('/auth/register', {
        name: form.name.trim(), email: form.email.toLowerCase().trim(), password: form.password,
      });
      navigate('/verify-email', { state: { email: form.email.toLowerCase().trim() } });
    } catch (err) {
      if (err.response?.data?.error === 'EMAIL_UNVERIFIED') {
        navigate('/verify-email', { state: { email: form.email.toLowerCase().trim(), fromLogin: true } });
        return;
      }
      setServerErr(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" style={{ background: 'var(--color-base)' }}>

      {/* ── Left panel ── */}
      <div
        className="hidden lg:flex flex-col items-center justify-center px-12 py-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0c1a3a 50%, #0f2654 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(56,189,248,0.10) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(56,189,248,0.06) 0%, transparent 60%)' }} />

        <div className="relative z-10 text-center mb-12">
          <div className="text-6xl mb-4" style={{ filter: 'drop-shadow(0 0 24px rgba(56,189,248,0.4))' }}>🏙️</div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>
            Nagar<span style={{ color: 'var(--color-accent)' }}>Seva</span>
          </h1>
          <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: 'var(--color-secondary)' }}>
            Join thousands of citizens making their city better, one report at a time.
          </p>
        </div>

        <div className="relative z-10 flex flex-col gap-3 w-full max-w-sm">
          {[
            { icon: '📍', title: 'Pin-drop Reporting',      desc: 'Drop a pin, snap a photo — done' },
            { icon: '🧠', title: 'Smart Deduplication',     desc: 'Clusters duplicate reports automatically' },
            { icon: '📊', title: 'Live Analytics',           desc: 'Real-time resolution dashboards' },
            { icon: '🔔', title: 'Instant Notifications',   desc: 'Know when your issue is resolved' },
          ].map((f) => (
            <div key={f.title}
              className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.06)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
            >
              <span className="text-2xl shrink-0">{f.icon}</span>
              <div>
                <strong className="block text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{f.title}</strong>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-14 overflow-y-auto">
        <div className="w-full max-w-sm">

          {/* Step indicator */}
          <div className="flex gap-2 mb-8">
            <div className="h-1 flex-1 rounded-full" style={{ background: 'var(--color-accent)' }} />
            <div className="h-1 flex-1 rounded-full" style={{ background: 'var(--color-elevated)' }} />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>
              Create your account
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-secondary)' }}>Step 1 of 2 — Your details</p>
          </div>

          {serverErr && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm mb-5 leading-snug"
              style={{ background: 'var(--color-danger-dim)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
              <span>⚠️</span><span>{serverErr}</span>
            </div>
          )}

          <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>

            {/* Full name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-name" className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Full Name
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none" style={{ color: 'var(--color-muted)' }}>👤</span>
                <input id="reg-name" className={`form-input${errors.name ? ' input-error' : ''}`}
                  type="text" name="name" placeholder="Rahul Sharma"
                  value={form.name} onChange={handleChange} autoComplete="name" disabled={loading} />
              </div>
              {errors.name && <span className="text-xs" style={{ color: 'var(--color-danger)' }}>⚠ {errors.name}</span>}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-email" className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none" style={{ color: 'var(--color-muted)' }}>✉️</span>
                <input id="reg-email" className={`form-input${errors.email ? ' input-error' : ''}`}
                  type="email" name="email" placeholder="you@example.com"
                  value={form.email} onChange={handleChange} autoComplete="email" disabled={loading} />
              </div>
              {errors.email && <span className="text-xs" style={{ color: 'var(--color-danger)' }}>⚠ {errors.email}</span>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-password" className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none" style={{ color: 'var(--color-muted)' }}>🔐</span>
                <input id="reg-password" className={`form-input pr-10${errors.password ? ' input-error' : ''}`}
                  type={showPwd ? 'text' : 'password'} name="password" placeholder="Min. 8 characters"
                  value={form.password} onChange={handleChange} autoComplete="new-password" disabled={loading} />
                <button type="button" onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base bg-transparent border-none p-1"
                  style={{ color: 'var(--color-muted)' }}>
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>

              {/* Strength bar */}
              {form.password && (
                <div className="flex items-center gap-1.5 mt-1">
                  {[1, 2, 3, 4].map((lvl) => (
                    <div key={lvl} className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{ background: lvl <= pwdStrength ? STRENGTH_COLORS[pwdStrength] : 'var(--color-elevated)' }} />
                  ))}
                  <span className="text-xs ml-1 shrink-0" style={{ color: STRENGTH_COLORS[pwdStrength] }}>
                    {STRENGTH_LABELS[pwdStrength]}
                  </span>
                </div>
              )}
              {errors.password && <span className="text-xs" style={{ color: 'var(--color-danger)' }}>⚠ {errors.password}</span>}
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-confirm" className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Confirm Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none" style={{ color: 'var(--color-muted)' }}>✅</span>
                <input id="reg-confirm" className={`form-input pr-10${errors.confirmPassword ? ' input-error' : ''}`}
                  type={showConfirm ? 'text' : 'password'} name="confirmPassword" placeholder="Repeat your password"
                  value={form.confirmPassword} onChange={handleChange} autoComplete="new-password" disabled={loading} />
                <button type="button" onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base bg-transparent border-none p-1"
                  style={{ color: 'var(--color-muted)' }}>
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
              {errors.confirmPassword && <span className="text-xs" style={{ color: 'var(--color-danger)' }}>⚠ {errors.confirmPassword}</span>}
            </div>

            <button type="submit" className="btn-primary mt-1" disabled={loading}>
              {loading ? <><span className="spinner" />Creating account...</> : 'Continue → Verify Email'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--color-secondary)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold" style={{ color: 'var(--color-accent)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
