# Safety Locks — Defensive Engineering & Interview Guide

## Overview

This document catalogs every defensive measure, guard, and safety lock in the NagarSeva platform. These are the things that prevent data corruption, unauthorized access, race conditions, and user confusion — the difference between a hobby project and a production-grade system.

---

## 1. Authentication & Session Safety

### 1.1 httpOnly JWT Cookie

```js
res.cookie('token', jwt, {
  httpOnly: true,    // JS cannot read it → XSS-proof
  secure: true,      // HTTPS only in production
  sameSite: 'lax',   // Prevents CSRF on POST/PATCH/DELETE
  maxAge: 7 * 24 * 60 * 60 * 1000
});
```

| Threat | Protection |
|--------|-----------|
| XSS token theft | httpOnly — invisible to `document.cookie` |
| CSRF | sameSite=lax — browser won't attach cookie on cross-origin mutations |
| Network sniffing | secure=true — cookie only sent over HTTPS |
| Session persistence after logout | `res.clearCookie()` on logout and password reset |

**Interview:** "I chose httpOnly cookies over localStorage because a single XSS vulnerability in any dependency can exfiltrate localStorage tokens. httpOnly makes the token completely inaccessible to JavaScript."

### 1.2 Password Hashing (bcrypt, cost 12)

```js
const hash = await bcrypt.hash(password, 12); // ~250ms per hash
```

| Attack | Defense |
|--------|---------|
| Rainbow tables | bcrypt includes a random salt per hash |
| Brute-force | 250ms/hash → 4 hashes/sec → 28 years for 8-char password |
| Credential stuffing | Rate limiter (10 attempts / 15 min) |

**Interview:** "Cost factor 12 means each hash takes ~250ms. Even with GPU acceleration, an attacker can't brute-force faster than the hash allows. Combined with per-hash salting, precomputed tables are useless."

### 1.3 Rate Limiting (3-tier)

| Endpoint group | Limit | Window | Protects against |
|----------------|-------|--------|------------------|
| General API | 100 req | 15 min | DoS, scraping |
| Auth (login/register) | 10 req | 15 min | Credential stuffing |
| OTP (send/resend) | 5 req | 1 hour | OTP flooding, SMS costs |

**Interview:** "Three tiers of rate limiting: broad API (prevents DoS), auth-specific (prevents brute-force login), and OTP-specific (prevents abuse of email sending). Each uses express-rate-limit with per-IP tracking."

### 1.4 OTP Safety

| Mechanism | Purpose |
|-----------|---------|
| 6-digit code | 1M combinations — sufficient with rate limiting |
| 10-minute expiry | Limits brute-force window |
| Single-use (`used = TRUE` on consumption) | Prevents replay |
| Upsert (invalidate old before creating new) | Only latest code works |
| Type segregation (`VERIFY_EMAIL` vs `RESET_PASSWORD`) | Can't use verify code for reset |

**Brute-force probability:** 7 attempts possible within 10-min window (rate limit) → 7/1,000,000 = 0.0007% chance.

---

## 2. Role-Based Access Control (RBAC)

### 2.1 Three Enforcement Layers

```
Layer 1: Frontend routing (cosmetic — prevents UI access)
Layer 2: API middleware (roleGuard — returns 403)
Layer 3: Data scoping (queries filter by department_id from JWT)
```

Even if an attacker bypasses the frontend and calls the API directly:
- `auth` middleware verifies the JWT signature (can't forge)
- `roleGuard('SUPER_ADMIN')` checks the role claim
- Data queries use `department_id` from the token (can't see other departments)

### 2.2 JWT Payload Structure

```json
{ "id": "uuid", "email": "...", "role": "ADMIN", "department_id": 1, "iat": ..., "exp": ... }
```

The role and department are **baked into the token at login time**. Modifying them invalidates the signature (`jwt.verify()` rejects it). No server-side session store needed.

**Interview:** "Real security lives at the API layer, not the UI. Frontend routing is cosmetic — it just prevents UI confusion. The actual guard is `roleGuard('SUPER_ADMIN')` middleware that checks the signed JWT claim. Even with DevTools, you can't escalate privileges because the JWT signature validation would fail."

---

## 3. Staff Management Safety

### 3.1 Duplicate Email Prevention (Belt & Suspenders)

```js
// Application-level check (fast, informative error message)
const existing = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);
if (existing.rows.length > 0) {
  return res.status(409).json({ message: `User with ${email} already exists (role: ${existing.rows[0].role})` });
}

// Database-level constraint (ultimate safety net — catches race conditions)
// CREATE TABLE users (..., email VARCHAR(255) UNIQUE NOT NULL, ...)
```

**Why both?**
- App check: gives a helpful error message ("already exists as FIELD_WORKER")
- DB constraint: catches the race condition where two concurrent requests both pass the app check

**Interview:** "I use defense in depth — the application pre-checks for a better UX error, but the database unique constraint is the real guard. If two requests hit simultaneously, the second INSERT fails at the DB level (23505 unique violation), which I catch and return 409."

### 3.2 Admin Cap Per Department

```js
// ╔════════════════════════════════════════════════════════════════════╗
// ║  CONFIGURABLE: Maximum admins allowed per department.            ║
// ║  Change this value to allow more admins per dept in the future.  ║
// ╚════════════════════════════════════════════════════════════════════╝
const MAX_ADMINS_PER_DEPT = 1;

// Enforcement:
const adminCount = await pool.query(
  "SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND department_id = $1",
  [department_id]
);
if (parseInt(adminCount.rows[0].count) >= MAX_ADMINS_PER_DEPT) {
  return res.status(400).json({ error: 'ADMIN_CAP_REACHED', ... });
}
```

**Why:** Prevents organizational confusion. One department = one responsible admin. If you need multiple in the future, change the constant. The error message auto-adapts.

**Where to change:** `server/src/controller/superAdmin.js`, line ~420.

### 3.3 Credential Email Failure Handling

```
                    ┌─────────────┐
                    │ Create User │  (always succeeds — committed to DB)
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Send Email  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────────┐
              │ SUCCESS    │                │ FAILURE
              ▼            │                ▼
        email_sent=true    │          email_sent=false
        (normal flow)      │          (warning shown to SuperAdmin)
                           │                │
                           │                ▼
                           │    ┌────────────────────────┐
                           │    │ Recovery options:      │
                           │    │ 1. "Resend" button     │
                           │    │ 2. User: Forgot Pwd    │
                           │    │ 3. Dev mode: shown     │
                           │    └────────────────────────┘
```

**Design decision:** User creation is committed BEFORE email is sent. If we made it transactional (rollback on email failure), a temporary SMTP outage would prevent all staff additions.

**Interview:** "I decouple user creation from email delivery. The user exists in the DB regardless of SMTP status. The response includes an `email_sent` boolean so the frontend can warn the SuperAdmin. The 'Resend Credentials' endpoint generates a NEW password (invalidating the old one) and re-attempts delivery."

### 3.4 Password Never Stored in Plaintext

```
Generated → bcrypt hashed → stored in DB → emailed to user → variable goes out of scope

The plaintext exists ONLY:
- In memory during the request handler (~10ms)
- In the SMTP payload (encrypted in transit via TLS)
- In dev mode: shown in the API response (NOT in production)
```

**Interview:** "The generated password exists in memory for exactly one function execution — it's hashed for the DB and emailed to the user, then it's garbage collected. I never store it, log it, or persist it anywhere. If the email fails, the only recovery is 'Forgot Password' (which generates a new one via OTP)."

---

## 4. Data Integrity Safety

### 4.1 Advisory Locks (Race Condition Prevention)

```sql
SELECT pg_advisory_xact_lock($1);  -- blocks competing submissions
```

**Problem:** Two citizens submit the same pothole simultaneously. Both pass the dedup check before either commits.

**Solution:** Transaction-level advisory locks keyed on `hash(category + gridCell)`. Only submissions targeting the same spatial bucket serialize; everything else proceeds in parallel.

**Interview:** "I use PostgreSQL advisory locks with a grid-cell hash key to serialize competing submissions. The lock is transaction-scoped — auto-releases on COMMIT or ROLLBACK, zero leak risk. Different categories and distant locations don't block each other."

### 4.2 INSERT RETURNING for Idempotency (Me Too)

```js
const insertResult = await client.query(
  `INSERT INTO watchers (issue_id, user_id) VALUES ($1, $2)
   ON CONFLICT (issue_id, user_id) DO NOTHING
   RETURNING issue_id`,
  [issue_id, user_id]
);

if (insertResult.rows.length === 0) {
  // Already endorsed — don't increment counts
  return res.status(200).json({ already_endorsed: true });
}

// Only increment if the watcher was genuinely new
await client.query('UPDATE issues SET report_count = report_count + 1 ...');
```

**Interview:** "I use the database's unique constraint as the source of truth for idempotency. INSERT RETURNING tells me atomically whether the row was new. If ON CONFLICT fires, zero rows return, and I skip the UPDATE. No TOCTOU race possible — the check and the write are the same statement."

### 4.3 Soft Delete (Departments)

```sql
ALTER TABLE departments ADD COLUMN deleted_at TIMESTAMPTZ NULL;
-- Active: WHERE deleted_at IS NULL
-- "Deleted": WHERE deleted_at IS NOT NULL
```

**Why not hard delete:**
- Issues reference `department_id` via FK → hard delete would violate constraint or cascade-delete issues
- Audit trail needs the department name for historical records
- "Undo delete" is trivial: `UPDATE SET deleted_at = NULL`

**Interview:** "I use soft-delete for departments because hard-delete would cascade or orphan foreign key references. Historical issues still show which department handled them. The `deleted_at IS NULL` filter in all active queries effectively 'hides' deleted departments without losing data."

### 4.4 Audit Trail Immutability

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    issue_id UUID REFERENCES issues(id),
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(id),
    note TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- No UPDATE or DELETE operations are ever performed on this table
```

**Interview:** "The audit table is append-only. No controller ever UPDATEs or DELETEs from it. This makes it legally defensible for civic accountability — every status change is permanently recorded with who did it, when, and why."

---

## 5. AI & External Service Safety

### 5.1 Exponential Backoff with Full Jitter

```js
function getBackoffDelay(attempt) {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
  return Math.random() * cappedDelay;  // FULL jitter
}
```

**Why full jitter (not equal jitter):**
- Equal jitter: `delay/2 + random(0, delay/2)` → all retries cluster around 75% of delay
- Full jitter: `random(0, delay)` → retries spread uniformly across the entire window
- Prevents thundering herd when 10 concurrent requests all retry at the same time

**Interview:** "I use the AWS-recommended full jitter pattern. If 10 users all hit a rate limit simultaneously, their retries spread uniformly across the backoff window rather than all firing at the midpoint."

### 5.2 Department Cache (Write-Through with TTL)

| Operation | Cost |
|-----------|------|
| AI call reads departments | 0ms (memory) |
| Department CRUD invalidates | O(1) flag set |
| TTL expiry (5 min) | 1 DB query |

**Safety:** Even if `invalidateCache()` is forgotten (bug), the 5-minute TTL guarantees eventual consistency. The AI will never use a stale department list for more than 5 minutes.

### 5.3 Cloudinary Signed Upload Safety

```js
// Server generates a HMAC signature for specific params:
const signature = cloudinary.utils.api_sign_request(
  { timestamp, folder },
  API_SECRET  // never sent to client
);
```

**What the client can do:** Upload images ONLY to the designated folder, ONLY within the signature's 1-hour validity window.

**What the client cannot do:** Upload to other folders, delete images, modify existing images, or access the API secret.

---

## 6. Frontend Safety

### 6.1 Credential Include (Cookies)

```js
fetch(url, { credentials: 'include' });  // sends/receives httpOnly cookies
```

Without `credentials: 'include'`, the browser won't attach the cookie, and the API returns 401.

### 6.2 AbortController (Stale Request Prevention)

```js
if (abortRef.current) abortRef.current.abort();
abortRef.current = new AbortController();
const res = await fetch(url, { signal: abortRef.current.signal });
```

**Safety:** Rapid map panning doesn't accumulate stale responses. Only the latest viewport's data is rendered. Cancelled requests don't consume bandwidth or trigger state updates.

### 6.3 Endorsed Issue Set (Client-Side Dedup)

```js
const [endorsedIds, setEndorsedIds] = useState(new Set());

// After successful endorsement:
setEndorsedIds(prev => new Set(prev).add(issueId));

// Button disabled:
disabled={endorsedIds.has(issue.id)}
```

**Safety:** Even though the server is idempotent, the frontend prevents redundant API calls entirely. The button physically grays out and shows "✅ Endorsed" after the first success.

---

## 7. Summary Table

| Safety Lock | Layer | Protects Against |
|-------------|-------|------------------|
| httpOnly cookie | Auth | XSS token theft |
| sameSite=lax | Auth | CSRF |
| bcrypt cost 12 | Auth | Brute-force, rainbow tables |
| 3-tier rate limiting | Auth | Credential stuffing, DoS, OTP flooding |
| OTP expiry + single-use + upsert | Auth | Replay attacks, multi-OTP abuse |
| roleGuard middleware | RBAC | Privilege escalation |
| department_id in JWT | RBAC | Cross-department data access |
| Duplicate email pre-check + PG constraint | Staff | Double account creation |
| MAX_ADMINS_PER_DEPT | Staff | Organizational confusion |
| email_sent flag + resend endpoint | Staff | Lost credentials |
| Password never persisted | Staff | Plaintext leak |
| Advisory locks | Data | Dedup race conditions |
| INSERT RETURNING | Data | Me-too double-counting |
| Soft delete | Data | FK violations, data loss |
| Append-only audit trail | Data | Accountability, tampering |
| Exponential backoff + full jitter | External | Thundering herd, API overload |
| Department cache TTL | External | Stale AI prompts |
| Signed uploads | External | Unauthorized Cloudinary access |
| AbortController | Frontend | Stale data rendering |
| endorsedIds Set | Frontend | Redundant API calls |
| credentials: 'include' | Frontend | Cookie attachment |

---

## Interview Master Answer

> "The platform implements defense in depth across four layers. Authentication uses httpOnly cookies with bcrypt and 3-tier rate limiting. RBAC is enforced server-side via JWT claims — frontend routing is cosmetic. Data integrity uses PostgreSQL advisory locks for race conditions and INSERT RETURNING for idempotent writes. External services are protected by exponential backoff with full jitter and write-through caching. Every destructive operation goes through an append-only audit trail. The staff management system uses a configurable admin cap, email delivery tracking with resend capability, and generated passwords that exist in memory for exactly one request lifecycle."
