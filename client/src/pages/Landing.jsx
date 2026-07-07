/**
 * pages/Landing.jsx
 *
 * Public homepage — accessible without authentication.
 * High-impact hero, interactive workflow visualization, stats, and CTA.
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

const WORKFLOW_STEPS = [
  { id: 1, icon: '📷', title: 'Capture', desc: 'Snap a photo of the civic issue with your phone' },
  { id: 2, icon: '🤖', title: 'AI Analysis', desc: 'Our AI classifies severity and routes to the right department' },
  { id: 3, icon: '📍', title: 'Geo-Tag', desc: 'Pin the exact location on a map for precision routing' },
  { id: 4, icon: '🏢', title: 'Department Routing', desc: 'Issue auto-assigned to the responsible municipal department' },
  { id: 5, icon: '👷', title: 'Field Resolution', desc: 'Field workers resolve on-ground with photo proof' },
  { id: 6, icon: '✅', title: 'Verified Closure', desc: 'Track resolution in real-time via City Pulse' },
];

const STATS = [
  { value: '50m', label: 'Dedup Radius' },
  { value: '<5ms', label: 'Spatial Query' },
  { value: '460+', label: 'Tokens/sec (AI)' },
  { value: '4', label: 'Role Hierarchy' },
];

const FEATURES = [
  { icon: '🗺️', title: 'City Pulse Map', desc: 'Viewport-based rendering with Supercluster. Browse live issues near you.' },
  { icon: '🔄', title: 'Smart Deduplication', desc: 'Advisory locks + spatial indexing prevent duplicate reports automatically.' },
  { icon: '👍', title: 'Community Upvoting', desc: 'Proximity-validated endorsements boost priority for municipal workers.' },
  { icon: '📊', title: 'Worker Ranking', desc: 'Composite scoring algorithm assigns the best-fit field worker per issue.' },
  { icon: '🔐', title: 'Zero-Trust Auth', desc: 'httpOnly cookies, bcrypt-12, 3-tier rate limiting, OTP verification.' },
  { icon: '⚡', title: 'Sub-millisecond Queries', desc: 'PostGIS GIST index + bounding-box operators for O(log n) spatial lookups.' },
];

function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.15 }
    );
    const children = ref.current?.querySelectorAll('.reveal-item');
    children?.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return ref;
}

export default function Landing() {
  const { isAuthenticated } = useSelector((s) => s.auth);
  const workflowRef = useScrollReveal();
  const featuresRef = useScrollReveal();

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <span className="landing-nav-logo">🏙️</span>
          <span className="landing-nav-name">Nagar<span className="landing-nav-accent">Seva</span></span>
        </div>
        <div className="landing-nav-links">
          {isAuthenticated ? (
            <Link to="/" className="landing-nav-cta">Dashboard →</Link>
          ) : (
            <>
              <Link to="/login" className="landing-nav-link">Sign In</Link>
              <Link to="/register" className="landing-nav-cta">Get Started</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-glow" />
        <div className="landing-hero-content">
          <p className="landing-hero-tag">Smart Civic Infrastructure Platform</p>
          <h1 className="landing-hero-title">
            Your City.<br />Your Voice.<br />
            <span className="landing-hero-accent">Real Change.</span>
          </h1>
          <p className="landing-hero-sub">
            Report potholes, broken lights, and civic hazards in seconds.
            AI-powered routing ensures the right department resolves it — fast.
          </p>
          <div className="landing-hero-actions">
            <Link to="/register" className="landing-btn-primary">Report an Issue →</Link>
            <a href="#how-it-works" className="landing-btn-ghost">See How It Works</a>
          </div>
        </div>

        {/* Stats strip */}
        <div className="landing-stats">
          {STATS.map((s) => (
            <div key={s.label} className="landing-stat">
              <span className="landing-stat-val">{s.value}</span>
              <span className="landing-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works — Interactive Workflow */}
      <section id="how-it-works" className="landing-workflow" ref={workflowRef}>
        <h2 className="landing-section-title">How It Works</h2>
        <p className="landing-section-sub">From photo to resolution — a 6-step automated pipeline</p>

        <div className="workflow-path">
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={step.id} className="workflow-node reveal-item" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="workflow-icon">{step.icon}</div>
              <div className="workflow-connector" />
              <h3 className="workflow-title">{step.title}</h3>
              <p className="workflow-desc">{step.desc}</p>
              <span className="workflow-step-num">{step.id}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="landing-features" ref={featuresRef}>
        <h2 className="landing-section-title">Built for Scale</h2>
        <p className="landing-section-sub">Engineering decisions that make NagarSeva production-ready</p>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="feature-card reveal-item" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="feature-icon">{f.icon}</span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-cta-section">
        <h2 className="landing-cta-title">Ready to make your city better?</h2>
        <p className="landing-cta-sub">Join thousands of citizens driving civic accountability.</p>
        <Link to="/register" className="landing-btn-primary" style={{ maxWidth: 280 }}>
          Create Free Account →
        </Link>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <span>🏙️</span> NagarSeva
        </div>
        <div className="landing-footer-links">
          <span>PostGIS</span>
          <span>·</span>
          <span>Groq AI</span>
          <span>·</span>
          <span>React</span>
          <span>·</span>
          <span>Express</span>
        </div>
        <p className="landing-footer-copy">Built with ❤️ for Indian cities</p>
      </footer>
    </div>
  );
}
