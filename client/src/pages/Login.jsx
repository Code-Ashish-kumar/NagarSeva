import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setAuth } from '../slices/authSlice';
import { login as loginAPI } from '../services/Operations/authAPI';

const FEATURES = [
  { icon: '📍', title: 'Geo-tagged Reporting',  desc: 'Pin-drop precision for every issue' },
  { icon: '🤖', title: 'AI-Powered Analysis',   desc: 'Auto-categorize from your photo'     },
  { icon: '⚡', title: 'Real-time Tracking',    desc: 'Live status updates via push'         },
];

export default function Login() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const dispatch   = useDispatch();

  const [form, setForm]           = useState({ email: '', password: '' });
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState({});
  const [serverErr, setServerErr] = useState('');

  const from = location.state?.from?.pathname || '/';

  function validate() {
    const e = {};
    if (!form.email)                            e.email    = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email    = 'Enter a valid email';
    if (!form.password)                         e.password = 'Password is required';
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
      const data = await loginAPI(form.email.toLowerCase().trim(), form.password);
      // Cookie is set by backend automatically — no localStorage needed
      dispatch(setAuth(data.user));
      navigate(from, { replace: true });
    } catch (err) {
      if (err.data?.error === 'EMAIL_UNVERIFIED') {
        navigate('/verify-email', { state: { email: form.email, fromLogin: true } });
        return;
      }
      setServerErr(err.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" style={{ background: 'var(--color-base)' }}>

      {/* ── Left branding panel ── */}
      <div
        className="hidden lg:flex flex-col items-center justify-center px-12 py-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0c1a3a 50%, #0f2654 100%)' }}
      >
        {/* Glow blobs */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(56,189,248,0.10) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(56,189,248,0.06) 0%, transparent 60%)' }} />

        {/* Brand */}
        <div className="relative z-10 text-center mb-14">
          <div className="text-6xl mb-4" style={{ filter: 'drop-shadow(0 0 24px rgba(56,189,248,0.4))' }}>🏙️</div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>
            Nagar<span style={{ color: 'var(--color-accent)' }}>Seva</span>
          </h1>
          <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: 'var(--color-secondary)' }}>
            Your city, your voice. Report civic issues and drive real change.
          </p>
        </div>

        {/* Feature bullets */}
        <div className="relative z-10 flex flex-col gap-3 w-full max-w-sm">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 cursor-default"
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
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-14">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>
              Welcome back
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-secondary)' }}>
              Sign in to your NagarSeva account
            </p>
          </div>

          {/* Server error */}
          {serverErr && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm mb-5 leading-snug"
              style={{ background: 'var(--color-danger-dim)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
              <span>⚠️</span><span>{serverErr}</span>
            </div>
          )}

          <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Email
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none" style={{ color: 'var(--color-muted)' }}>✉️</span>
                <input
                  id="login-email"
                  className={`form-input${errors.email ? ' input-error' : ''}`}
                  type="email" name="email" placeholder="you@example.com"
                  value={form.email} onChange={handleChange}
                  autoComplete="email" disabled={loading}
                />
              </div>
              {errors.email && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-danger)' }}>⚠ {errors.email}</span>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none" style={{ color: 'var(--color-muted)' }}>🔐</span>
                <input
                  id="login-password"
                  className={`form-input pr-10${errors.password ? ' input-error' : ''}`}
                  type={showPwd ? 'text' : 'password'} name="password" placeholder="Your password"
                  value={form.password} onChange={handleChange}
                  autoComplete="current-password" disabled={loading}
                />
                <button type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base bg-transparent border-none p-1 transition-colors duration-200"
                  style={{ color: 'var(--color-muted)' }}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}>
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
              {errors.password && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-danger)' }}>⚠ {errors.password}</span>}
            </div>

            {/* Submit */}
            <button type="submit" className="btn-primary mt-1" disabled={loading}>
              {loading ? <><span className="spinner" />Signing in...</> : 'Sign In →'}
            </button>
          </form>

          <p className="text-center text-sm mt-7" style={{ color: 'var(--color-secondary)' }}>
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-semibold" style={{ color: 'var(--color-accent)' }}>
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
