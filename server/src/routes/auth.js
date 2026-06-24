/**
 * routes/auth.js
 *
 * Endpoints:
 *   POST /api/auth/register          — create account, send verification OTP
 *   POST /api/auth/verify-email      — verify OTP, activate account + set cookie
 *   POST /api/auth/resend-otp        — resend verification OTP
 *   POST /api/auth/login             — login (must be verified) + set cookie
 *   POST /api/auth/logout            — clear JWT cookie
 *   GET  /api/auth/me                — get current user (protected)
 */
const express = require('express');

// Middlewares
const auth                        = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

// Controllers — file is at src/controller/auth.js
const {
  register,
  verifyEmail,
  resendOtp,
  login,
  me,
  logout,
} = require('../controller/auth');

const router = express.Router();

// ─── Routes ──────────────────────────────────────────────────────────────────

/** POST /api/auth/register — create account, send OTP */
router.post('/register',     authLimiter, register);

/** POST /api/auth/verify-email — verify OTP, mark verified, issue cookie */
router.post('/verify-email', authLimiter, verifyEmail);

/** POST /api/auth/resend-otp — resend verification OTP */
router.post('/resend-otp',   otpLimiter,  resendOtp);

/** POST /api/auth/login — authenticate + issue cookie */
router.post('/login',        authLimiter, login);

/** POST /api/auth/logout — clear JWT cookie */
router.post('/logout',       logout);

/** GET /api/auth/me — get current user (requires valid cookie) */
router.get('/me',            auth, me);

module.exports = router;
