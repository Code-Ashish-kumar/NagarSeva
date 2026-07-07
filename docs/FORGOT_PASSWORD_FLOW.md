# Authentication & Authorization — Complete Architecture

## Overview

NagarSeva uses a **stateless JWT authentication** system with **httpOnly cookies**, **OTP-based email verification**, **role-based access control (RBAC)**, and a **3-step password reset flow**. This document covers the full auth architecture, the forgot-password implementation, and all interview-worthy design decisions.

---

## Authentication Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React SPA)                              │
│                                                                         │
│  ┌─────────┐   ┌──────────┐   ┌──────────────┐   ┌────────────────┐   │
│  │ Login   │   │ Register │   │ Verify Email │   │ Forgot Password│   │
│  │ Page    │   │ Page     │   │ Page         │   │ (3-step)       │   │
│  └────┬────┘   └────┬─────┘   └──────┬───────┘   └───────┬────────┘   │
│       │              │                │                    │            │
│       │    credentials sent via POST body (HTTPS)          │            │
│       ▼              ▼                ▼                    ▼            │
└───────┼──────────────┼────────────────┼────────────────────┼────────────┘
        │              │                │                    │
        │   HTTP (credentials: 'include' — sends/receives cookies)
        ▼              ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVER (Express.js)                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Middleware Chain                               │   │
│  │                                                                  │   │
│  │  helmet() → cors(credentials) → cookieParser() → rateLimiter    │   │
│  │       → auth middleware (JWT verify) → roleGuard(roles)          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Token lifecycle:                                                       │
│    Login/Verify → bcrypt compare → generateToken(user)                 │
│                 → res.cookie('token', jwt, {httpOnly, secure, sameSite})│
│                                                                         │
│  Every subsequent request:                                             │
│    Browser auto-sends cookie → auth middleware decodes → req.user      │
│                                                                         │
│  Logout: res.clearCookie('token')                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## JWT Token Design

```js
// Payload structure
{
  id: "uuid",              // user primary key
  email: "user@email.com",
  role: "CITIZEN",         // CITIZEN | ADMIN | SUPER_ADMIN | FIELD_WORKER
  department_id: 1,        // null for citizens, integer for admin/workers
  iat: 1719849600,         // issued at (Unix timestamp)
  exp: 1720454400          // expires (configurable, default 7d)
}
```

**Cookie configuration:**
```js
res.cookie('token', jwt, {
  httpOnly: true,       // JavaScript cannot read it (XSS-proof)
  secure: true,         // HTTPS only (in production)
  sameSite: 'lax',      // Prevents CSRF on state-changing requests
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
});
```

---

## Role-Based Access Control (RBAC)

### Roles

| Role | Access Level | What they can do |
|------|-------------|------------------|
| CITIZEN | Public user | Report issues, endorse, view city pulse, track complaints |
| ADMIN | Department head | View dept queue, rank workers, assign issues |
| SUPER_ADMIN | Platform operator | Verify/reject all issues, manage departments, view all stats |
| FIELD_WORKER | On-ground resolver | View assignments, upload progress, mark resolved |

### Enforcement Layers

1. **Frontend routing** (`ProtectedRoute` + `RoleRedirect`): Cosmetic — prevents UI access but not security
2. **API middleware** (`roleGuard('SUPER_ADMIN')`): Real security — returns 403 if role doesn't match
3. **Data scoping**: Admin queries filter by `department_id` from JWT — even with valid token, can't see other departments

```js
// Middleware chain example:
router.patch('/issues/:id/verify', auth, roleGuard('SUPER_ADMIN'), verifyIssue);
//                                  ^         ^                      ^
//                           verify JWT   check role            business logic
```

---

## OTP Infrastructure

### Database Table

```sql
CREATE TABLE otps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL,
    code        VARCHAR(6) NOT NULL,          -- 6-digit numeric
    type        VARCHAR(20) NOT NULL          -- 'VERIFY_EMAIL' | 'RESET_PASSWORD'
                CHECK (type IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
    used        BOOLEAN DEFAULT FALSE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### OTP Lifecycle

```
createOtp(email, type):
  1. UPDATE otps SET used = TRUE WHERE email = $1 AND type = $2 AND used = FALSE
     (invalidate all previous codes for this email+type)
  2. INSERT new OTP with 10-minute expiry
  3. Return the 6-digit code

validateOtp(email, code, type):
  SELECT id FROM otps
  WHERE email = $1 AND code = $2 AND type = $3
    AND used = FALSE AND expires_at > NOW()
  LIMIT 1
```

### Rate Limiting

| Endpoint | Limiter | Limit |
|----------|---------|-------|
| `/auth/register` | authLimiter | 10 requests / 15 min / IP |
| `/auth/login` | authLimiter | 10 requests / 15 min / IP |
| `/auth/forgot-password` | otpLimiter | 5 requests / 1 hour / IP |
| `/auth/verify-reset-otp` | authLimiter | 10 requests / 15 min / IP |
| `/auth/reset-password` | authLimiter | 10 requests / 15 min / IP |
| `/auth/resend-otp` | otpLimiter | 5 requests / 1 hour / IP |

---

## Forgot Password — 3-Step Flow

### Step 1: Check Registration + Send OTP

```
POST /api/auth/forgot-password
Body: { email }

Server logic:
  1. Validate email format (Joi)
  2. SELECT user WHERE email = input
  3. If NOT found → 404 "No account found. Please register first."
  4. If found but NOT verified → 403 "Account not verified."
  5. If found AND verified → createOtp(email, 'RESET_PASSWORD') → sendEmail
  6. Return 200 { message, dev_otp (in dev mode) }
```

**Design decision — revealing registration status:**
Unlike some implementations that hide whether an email exists, we explicitly tell the user "not registered" because:
- The user needs to know if they have an account (civic platform, not a bank)
- The register page already reveals this via "email already taken" on duplicate signup
- The UX improvement outweighs the marginal security loss for a municipal platform

### Step 2: Verify OTP (Identity Confirmation)

```
POST /api/auth/verify-reset-otp
Body: { email, code }

Server logic:
  1. Validate format (6-digit numeric)
  2. Query otps table for matching unused unexpired code
  3. If NOT found → 400 "Invalid or expired code"
  4. If found → return 200 { verified: true }
     (OTP is NOT marked as used yet — preserved for Step 3)
```

**Why verify before allowing password input:**
- Proves the user owns the email before we even show them the password form
- Prevents an attacker from reaching the password-set screen without the OTP
- Clean UX separation: one task per step

### Step 3: Set New Password (Consumes OTP)

```
POST /api/auth/reset-password
Body: { email, code, newPassword }

Server logic:
  1. Validate all fields (Joi: email format, 6-digit code, min 8 char password)
  2. RE-VALIDATE OTP (defense in depth — even though Step 2 verified it)
  3. Mark OTP as used (consumed — can't be reused)
  4. bcrypt.hash(newPassword, 12) → UPDATE users SET password_hash
  5. res.clearCookie('token') → force re-login
  6. Return 200 { message: "Password reset! Log in with new password." }
```

**Defense in depth — why re-validate in Step 3:**
The OTP is re-checked server-side in Step 3 even though Step 2 already verified it. This prevents:
- A malicious actor intercepting the Step 2 success response and crafting a Step 3 request without the actual OTP
- Race conditions where the OTP expires between Step 2 and Step 3
- API consumers bypassing the frontend and calling Step 3 directly

---

## Security Measures Summary

| Threat | Mitigation |
|--------|-----------|
| XSS stealing tokens | httpOnly cookie — JS cannot access it |
| CSRF attacks | SameSite=lax + no GET mutations |
| Password brute-force | bcrypt cost factor 12 (~250ms/hash) |
| OTP brute-force | 6 digits + 5 req/hour limit + 10min expiry = 0.0007% guess probability |
| Credential stuffing | authLimiter: 10 attempts / 15 min / IP |
| Session hijacking | Secure flag (HTTPS-only in prod) |
| Stale sessions after password change | clearCookie on reset (force re-login) |
| Multiple valid OTPs | Upsert invalidates all previous codes before creating new one |
| Token replay | JWT expiry (default 7d) + no refresh token rotation (stateless) |

---

## Files Involved

### Backend

| File | Responsibility |
|------|----------------|
| `server/src/controller/auth.js` | All auth controllers: register, login, verifyEmail, resendOtp, forgotPassword, verifyResetOtp, resetPassword, me, logout |
| `server/src/routes/auth.js` | Route definitions with appropriate rate limiters per endpoint |
| `server/src/middleware/auth.js` | JWT extraction from cookie/header, verification, attaches `req.user` |
| `server/src/middleware/roleGuard.js` | Higher-order middleware factory for role checking |
| `server/src/middleware/rateLimiter.js` | Three limiter instances: apiLimiter, authLimiter, otpLimiter |
| `server/src/config/mailer.js` | Nodemailer setup, `sendOtpEmail(email, otp, type)` with HTML templates |
| `server/db/migrations/002_create_users.sql` | Users table with role enum + is_verified flag |
| `server/db/migrations/003_create_otps.sql` | OTP table with type enum + expiry + used flag |

### Frontend

| File | Responsibility |
|------|----------------|
| `client/src/pages/Login.jsx` | Login form + "Forgot password?" link |
| `client/src/pages/Register.jsx` | Registration form with password strength meter |
| `client/src/pages/VerifyEmail.jsx` | 6-digit OTP input with auto-advance + paste support |
| `client/src/pages/ForgotPassword.jsx` | 3-step flow: email → OTP → new password |
| `client/src/slices/authSlice.js` | Redux state: isAuthenticated, user, loading |
| `client/src/services/Operations/authAPI.js` | API call wrappers for all auth endpoints |
| `client/src/components/common/ProtectedRoute.jsx` | Route guard: redirects to /login if not authenticated |
| `client/src/components/common/RoleRedirect.jsx` | Redirects authenticated users to their role-specific dashboard |

---

## Interview Questions & Answers

### Q: "Why httpOnly cookies instead of localStorage?"
**A:** localStorage is accessible to any JavaScript running on the page. A single XSS vulnerability (injected script, compromised dependency) can steal the token. httpOnly cookies are invisible to JavaScript entirely — they're only sent with HTTP requests. The browser handles attachment automatically, and there's no code-level surface for exfiltration.

### Q: "How do you handle CSRF with cookies?"
**A:** SameSite=lax prevents the browser from sending the cookie on cross-origin requests that mutate state (POST, PATCH, DELETE). Only same-origin navigations and GET requests will attach the cookie. Since all our state-changing endpoints are POST/PATCH/DELETE, CSRF is mitigated without needing a CSRF token.

### Q: "Why not use refresh tokens?"
**A:** For a municipal civic platform, the threat model doesn't justify the complexity of refresh token rotation. A 7-day JWT expiry with httpOnly storage is sufficient. If we needed shorter access windows, we'd implement a refresh cookie with rotation and reuse detection, but that adds database state (token family tracking) which contradicts the stateless JWT advantage.

### Q: "How do you prevent timing attacks on email enumeration?"
**A:** In the forgot-password flow, we intentionally reveal whether an email is registered (civic platform UX priority). However, the registration and resend-otp endpoints use consistent response times via `bcrypt.hash` (always computed, even on non-existent users in registration) to prevent timing-based enumeration in the signup flow.

### Q: "How do you invalidate sessions after password reset?"
**A:** We `clearCookie('token')` in the response. The old JWT is still technically valid (stateless), but without the cookie, the browser won't send it. For complete invalidation (e.g., compromised device in another browser), we'd need a token blacklist (Redis) or short-lived tokens with refresh rotation — out of scope for this MVP.

### Q: "Why 3 steps instead of 2 for password reset?"
**A:** Separation of concerns. Step 1 (email) confirms registration status. Step 2 (OTP) proves email ownership. Step 3 (password) is the action. If Steps 2 and 3 were combined, a user might fill in a new password, submit, and only then learn the OTP is wrong — wasting their effort. Separating them gives clear feedback at each gate.

### Q: "What happens if someone calls reset-password directly without verify-reset-otp?"
**A:** It still works — the reset-password endpoint re-validates the OTP server-side (defense in depth). The verify step is a UX optimization (gates the password form), not a security requirement. The real guard is the OTP check in reset-password itself.

### Q: "How is the role used after authentication?"
**A:** The role is in the JWT payload. On each API request, `auth` middleware decodes it into `req.user.role`. The `roleGuard` middleware checks if `req.user.role` is in the allowed list. Frontend uses it for routing (cosmetic) but real enforcement is always server-side. Even if someone modifies the JWT payload, `jwt.verify()` will reject it because the signature won't match.
