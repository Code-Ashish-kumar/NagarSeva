# NagarSeva — Complete File Reference & Interview Guide

## Project Overview

NagarSeva is a smart civic issue reporting platform for Indian cities. Citizens report infrastructure problems (potholes, garbage, broken lights) with photos and GPS location. AI validates the reports, the system deduplicates nearby complaints, and a role-based hierarchy (SuperAdmin → Admin → Field Worker) routes and resolves them.

**Tech Stack:** React 18 + Vite + Redux Toolkit + Leaflet + Supercluster | Express.js + PostgreSQL + PostGIS + Cloudinary + Groq (Qwen 3.6 27B)

---

## Server Files

### Configuration

| File | Purpose | Interview Point |
|------|---------|-----------------|
| `server/src/config/db.js` | PostgreSQL connection pool (max 10, idle timeout 30s) | "Connection pooling prevents opening a new TCP socket on every query. The pool reuses connections, keeping latency under 1ms for warm queries." |
| `server/src/config/ai.js` | Groq SDK wrapper for Qwen 3.6 27B multimodal analysis. Exponential backoff with full jitter on 429/503. | "I use full jitter (`random(0, cap)`) instead of equal jitter to prevent thundering herd when multiple retried requests would otherwise all fire at the same backoff interval." |
| `server/src/config/cloudinary.js` | Cloudinary v2 config (reads env vars at startup) | "Client uploads directly to Cloudinary using a signed upload. The server generates a time-limited HMAC signature — images never transit through Express, saving bandwidth." |
| `server/src/config/dedup.js` | Reads `DEDUP_RADIUS_METRES` (default 50) and `DEDUP_PRIORITY_BOOST` (default 1.0) from env | "Configuration is externalized so different city deployments can tune dedup aggressiveness without code changes." |
| `server/src/config/mailer.js` | Nodemailer transport (Gmail/Mailtrap). Verifies connection at startup. | "SMTP verification on boot gives immediate feedback if credentials are wrong, rather than failing silently on the first OTP send." |

### Middleware

| File | Purpose | Interview Point |
|------|---------|-----------------|
| `server/src/middleware/auth.js` | Extracts JWT from httpOnly cookie or Authorization header, verifies, attaches `req.user` | "httpOnly cookies prevent XSS from stealing tokens. The fallback to Bearer header supports API testing tools like Postman." |
| `server/src/middleware/roleGuard.js` | Factory function `roleGuard('ADMIN', 'SUPER_ADMIN')` — checks `req.user.role` | "It's a higher-order function returning middleware. Composable: same guard reused across routes with different role combinations." |
| `server/src/middleware/rateLimiter.js` | Three limiters: API (100/15min), auth (10/15min), OTP (5/hour) | "Graduated rate limiting: sensitive endpoints get stricter limits. Prevents brute-force without impacting legitimate usage." |
| `server/src/middleware/errorHandler.js` | Centralized error handler. Handles Joi errors, PG unique violations, generic 500s. | "All errors flow through one handler. No scattered try-catches in routes. Consistent error shape for the frontend." |

### Controllers

| File | Purpose | Interview Point |
|------|---------|-----------------|
| `server/src/controller/auth.js` | Register, login, verify-email, resend-otp, me, logout. JWT in httpOnly cookie. | "OTP is upserted (old ones invalidated) to prevent race conditions where two OTPs are valid simultaneously." |
| `server/src/controller/complaints.js` | AI image analysis endpoint. Accepts multi-image, validates, calls Groq, returns structured JSON. | "The controller is model-agnostic — it just calls `analyzeComplaint()`. We swapped from Gemini to Groq without changing this file." |
| `server/src/controller/issue.js` | Full issue lifecycle: create (with dedup + advisory lock), viewport query, me-too (location-validated), watchers-based getMyIssues | "The `meToo` endpoint uses INSERT RETURNING as an atomic idempotency check — if the watcher row already exists, ON CONFLICT returns 0 rows, and we skip the UPDATE. No TOCTOU race." |
| `server/src/controller/upload.js` | Generates Cloudinary signed upload params (timestamp + folder + HMAC signature) | "Signed uploads shift bandwidth from server to client. The signature ensures the client can only upload to our folder." |
| `server/src/controller/superAdmin.js` | Triaging queue, issue detail, verify/reject, department CRUD, dashboard stats | "Stats use PostgreSQL FILTER clauses — one table scan computes all counts instead of 5 separate COUNT queries." |
| `server/src/controller/admin.js` | Department queue, worker ranking (composite score CTE), assign worker, dept stats | "Worker Score S = w₁E + w₂R − w₃B computed in a single CTE with window functions. One DB round-trip ranks all workers." |

### Utilities

| File | Purpose | Interview Point |
|------|---------|-----------------|
| `server/src/utils/asyncHandler.js` | Wraps async route handlers to auto-catch and forward to error middleware | "Eliminates try-catch boilerplate. Every async error automatically reaches the centralized handler." |
| `server/src/utils/dedupLock.js` | Computes a deterministic advisory lock key from `hash(category + gridCell(lat,lng))` | "Advisory locks serialize only competing spatial submissions. Different categories/areas proceed in parallel — O(1) contention." |

### Routes

| File | Routes |
|------|--------|
| `server/src/routes/auth.js` | POST register, verify-email, resend-otp, login, logout; GET me |
| `server/src/routes/issue.js` | GET viewport, nearby, mine; POST create, :id/watch, :id/me-too; PATCH :id/status; DELETE :id/watch |
| `server/src/routes/complaints.js` | POST /analyze (AI analysis) |
| `server/src/routes/upload.js` | GET /signature (Cloudinary) |
| `server/src/routes/superAdmin.js` | GET stats, queue, departments, issues/:id/detail; PATCH verify, reject; POST departments; DELETE departments/:id |
| `server/src/routes/admin.js` | GET stats, queue, workers; PATCH issues/:id/assign |

### Migrations

| File | What it creates |
|------|-----------------|
| `001_enable_extensions.sql` | PostGIS + pgcrypto |
| `002_create_users.sql` | Users table with role enum, GIST on email |
| `003_create_otps.sql` | OTP table with expiry index |
| `004_create_issues.sql` | Issues with PostGIS GEOGRAPHY point, GIST spatial index, status enum, priority_score, report_count |
| `005_audit_logs.sql` | Immutable audit trail with JSONB metadata |
| `006_watchers.sql` | Composite PK (issue_id, user_id) for dedup + notifications |
| `007_issue_images.sql` | Multi-type images (REPORT, PROGRESS, RESOLUTION_PROOF) |
| `008_departments_and_relations.sql` | Departments table with soft-delete, links to users and issues, seeds 8 depts |

### Seeds/Scripts

| File | Purpose |
|------|---------|
| `server/db/migrate.js` | Sequential migration runner |
| `server/db/seed-super-admin.js` | Creates a test SUPER_ADMIN user |

---

## Client Files

### Pages

| File | Route | Purpose | Interview Point |
|------|-------|---------|-----------------|
| `Login.jsx` | `/login` | Email/password auth with cookie-based session | "No localStorage for tokens. httpOnly cookie is set by the server, immune to XSS." |
| `Register.jsx` | `/register` | Create account + password strength meter | "Strength scoring uses 4 independent checks (length, uppercase, number, special) — no regex monster." |
| `VerifyEmail.jsx` | `/verify-email` | 6-digit OTP input with auto-advance and paste support | "Auto-submits when all 6 digits are filled. Paste handler parses clipboard for exactly 6 digits." |
| `CitizenDashboard.jsx` | `/citizen` | Landing page with stats and action buttons | "Entry point to all citizen flows: report, my complaints, city pulse." |
| `ReportWizard.jsx` | `/citizen/report` | 4-step complaint wizard orchestrator | "Redux slice preserves wizard state across step navigation. Back button restores previous inputs." |
| `MyComplaints.jsx` | `/citizen/complaints` | Watched issues list (JOIN watchers, not reporter_id filter) | "Using watchers as source of truth means merged citizens see 'their' issues without a separate merged_reports table." |
| `CityPulse.jsx` | `/citizen/city-pulse` | Viewport-based map with Supercluster clustering + floating card + Me Too | "Frontend K-D tree (Supercluster) ensures the browser renders ~50 elements regardless of data volume. Debounce + AbortController prevents stale fetches." |
| `SuperAdminDashboard.jsx` | `/super-admin` | Triaging queue, review modal, department management, auto-refresh | "Priority updates from citizen upvotes are reflected in queue ordering via 30s polling. The queue naturally reorders as issues accumulate endorsements." |
| `AdminDashboard.jsx` | `/admin` | Department queue + worker ranking + allocation + resource grid | "Worker Score computed server-side in one CTE. Admin clicks Allocate → ranked workers appear inline → picks best → issue moves to IN_PROGRESS." |
| `FieldWorkerDashboard.jsx` | `/field-worker` | Placeholder (Phase 3) | — |

### Complaint Wizard Components

| File | Step | Purpose |
|------|------|---------|
| `Step1_ImageCapture.jsx` | 1 | Multi-image capture (up to 5), camera on mobile, AI validation on primary image |
| `Step2_LocationPin.jsx` | 2 | Leaflet map with geolocation, fly-to animation, draggable pin, editable address |
| `Step3_Description.jsx` | 3 | Textarea (20-500 chars), sends all images to AI for enriched analysis |
| `Step4_ReviewForm.jsx` | 4 | Read-only review, Cloudinary upload, issue creation, merge notification |
| `StepIndicator.jsx` | — | Visual breadcrumb (4 steps) |

### State Management

| File | Purpose |
|------|---------|
| `store/store.js` | Redux store with auth + complaint reducers |
| `slices/authSlice.js` | `isAuthenticated`, `user`, `loading` |
| `slices/complaintSlice.js` | Full wizard draft: images[], location, description, aiResult, step |

### Services

| File | Purpose |
|------|---------|
| `services/api.js` | All endpoint URLs (centralized, includes function-style for parameterized endpoints) |
| `services/apiConnector.js` | Generic fetch wrapper with credentials, JSON parsing, error shaping |
| `services/Operations/authAPI.js` | Auth-specific API call wrappers |

### Styles

| File | Scope |
|------|-------|
| `styles/globals.css` | Design tokens (CSS custom properties), base reset, Tailwind v4 entry, mobile typography |
| `styles/auth.css` | Auth page specific styles |
| `styles/complaint.css` | Wizard, image grid, map, review, My Complaints |
| `styles/citypulse.css` | City Pulse map page, clusters, floating card |
| `styles/superadmin.css` | SuperAdmin dashboard, queue, review modal, departments |

---

## Documentation Files

| File | Purpose |
|------|---------|
| `docs/QUERY_OPTIMIZATIONS.md` | PostGIS GIST index, ST_DWithin vs ST_Distance, filter-first strategy, advisory locks, single-query candidate selection |
| `docs/VIEWPORT_MAP_ARCHITECTURE.md` | Bounding box queries, Supercluster K-D tree, debounce + AbortController, floating card UX, contextual upvoting, scalability ladder |
| `docs/NEXT_STAGE_PLAN.md` | Full issue lifecycle, worker ranking algorithm (S = w₁E + w₂R − w₃B), phase plan |
| `docs/ADMIN_PHASE_DETAIL.md` | Deep dive: worker ranking algorithm, CTE structure, department scoping, testing flow |
| `docs/PROJECT_FILE_REFERENCE.md` | This file — complete file inventory with interview points |
| `AUTH_SETUP.md` | Auth flow documentation, SMTP setup, key file listing |

---

## Key Architectural Decisions (Interview Summary)

1. **PostGIS over MongoDB** — R-tree spatial indexing with GIST, bounding box operators, ST_DWithin for circle queries, ST_MakeEnvelope for viewport queries. All index-accelerated.

2. **Advisory Locks for Race Conditions** — `pg_advisory_xact_lock` with grid-cell hashing. Serializes only competing spatial submissions. Transaction-scoped (auto-releases).

3. **INSERT RETURNING for Idempotency** — The "Me too" endpoint uses `INSERT ... ON CONFLICT DO NOTHING RETURNING` to atomically check-and-set. No TOCTOU race possible.

4. **Exponential Backoff with Full Jitter** — AI calls retry with `random(0, min(cap, base * 2^attempt))`. Prevents thundering herd across concurrent users.

5. **Signed Direct Upload** — Images go client → Cloudinary (not through Express). Server provides HMAC-signed params. Saves bandwidth and eliminates file handling code.

6. **Viewport-Based Fetching** — The map sends bounding box coordinates. Backend uses `&&` operator (pure GIST index intersection). Frontend clusters with Supercluster's K-D tree. ~50 DOM elements regardless of data volume.

7. **Priority = Community Signal** — `priority_score` increases on every upvote/merge. SuperAdmin queue auto-sorts by priority. Most-reported issues surface first without manual prioritization.

8. **Soft Delete Pattern** — Departments use `deleted_at IS NULL`. Rejected issues stay in DB (status filter). Preserves referential integrity and audit trail.

9. **Cookie-Based Auth** — httpOnly JWT cookie. Immune to XSS (JavaScript can't read it). SameSite=lax prevents CSRF on state-changing requests.

10. **Worker Ranking Algorithm** — Composite score `S = 0.3E + 0.4R − 0.3B` computed in a single CTE with window functions. No N+1 queries.
