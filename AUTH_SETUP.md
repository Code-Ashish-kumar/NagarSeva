# NagarSeva — Auth Setup Guide

## Quick Start

### 1. Start the database
```bash
docker compose up -d
```

### 2. Set up the server
```bash
cd server
cp .env.example .env     # fill in your values
npm install
node db/migrate.js       # runs all SQL migrations
npm run dev              # starts on http://localhost:5000
```

### 3. Set up the client
```bash
cd client
npm install
npm run dev              # starts on http://localhost:5173
```

---

## Testing Auth (Without Real SMTP)

The server returns `dev_otp` in the response body when `NODE_ENV=development`.

### Register flow
```bash
# 1. Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Response includes:
# { "message": "...", "email": "...", "dev_otp": "482931" }

# 2. Verify with the dev_otp
curl -X POST http://localhost:5000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"482931"}'

# Response includes access_token + refresh_token
```

### Login flow
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Get current user
```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## For Real Email (Optional)

**Option A — Mailtrap (recommended for dev):**
1. Sign up at https://mailtrap.io
2. Go to Email Testing → Inboxes → SMTP Settings
3. Copy host, port, username, password into `.env`

**Option B — Gmail:**
1. Enable 2FA on your Google account
2. Create an App Password (Google Account → Security → App Passwords)
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, use App Password as `SMTP_PASS`

---

## Auth Flow Summary

```
Register page
    │
    ▼ POST /api/auth/register
    │   → Creates unverified user
    │   → Sends OTP to email
    │   → Returns dev_otp in dev mode
    │
    ▼ VerifyEmail page (email pre-filled from router state)
    │
    ▼ POST /api/auth/verify-email
    │   → Marks user verified
    │   → Returns access_token + refresh_token
    │   → Frontend stores in localStorage, sets AuthContext
    │
    ▼ /map (protected) ← user is now logged in
```

---

## Files Created

### Backend (`server/`)
```
server.js                        ← entry point
src/app.js                       ← Express setup
src/config/db.js                 ← Postgres pool
src/config/mailer.js             ← Nodemailer + OTP email
src/middleware/auth.js           ← JWT verification
src/middleware/roleGuard.js      ← RBAC
src/middleware/rateLimiter.js    ← auth + OTP rate limits
src/middleware/errorHandler.js   ← centralized errors
src/routes/auth.js               ← all 6 auth endpoints
src/utils/asyncHandler.js        ← try/catch wrapper
db/migrations/001_enable_extensions.sql
db/migrations/002_create_users.sql
db/migrations/003_create_otps.sql
db/migrate.js                    ← migration runner
```

### Frontend (`client/`)
```
src/main.jsx                     ← React entry point
src/App.jsx                      ← Router + routes
src/api/axios.js                 ← Axios + JWT interceptors + auto-refresh
src/context/AuthContext.jsx      ← Global auth state
src/components/common/ProtectedRoute.jsx ← Route guard
src/pages/Login.jsx              ← Login page
src/pages/Register.jsx           ← Register page
src/pages/VerifyEmail.jsx        ← OTP verification page
src/pages/MapView.jsx            ← Placeholder (Day 2: real map)
src/styles/globals.css           ← Design system (CSS variables)
src/styles/auth.css              ← Auth page styles
```

