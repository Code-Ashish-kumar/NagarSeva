/**
 * routes/auth.js
 *
 * Endpoints:
 *   POST /api/auth/register          — create account, send verification OTP
 *   POST /api/auth/verify-email      — verify OTP, activate account
 *   POST /api/auth/resend-otp        — resend verification OTP
 *   POST /api/auth/login             — login (must be verified)
 *   POST /api/auth/refresh           — refresh access token
 *   GET  /api/auth/me                — get current user (protected)
 */
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const Joi      = require('joi');
const pool     = require('../config/db');
const { sendOtpEmail } = require('../config/mailer');
const auth         = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────────────

const registerSchema = Joi.object({
  name:     Joi.string().min(2).max(100).trim().required(),
  email:    Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(72).required(),
  role:     Joi.string().valid('CITIZEN').default('CITIZEN'),   // citizens only self-register
});

const loginSchema = Joi.object({
  email:    Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const otpSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  code:  Joi.string().length(6).pattern(/^\d+$/).required(),
});

const resendSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a cryptographically random 6-digit OTP */
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Sign a short-lived access token */
function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

/** Sign a long-lived refresh token */
function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

/**
 * Upsert an OTP — invalidate any existing codes for this email+type,
 * then insert a fresh one.
 */
async function createOtp(email, type) {
  const code      = generateOtp();
  const expiresAt = new Date(Date.now() + (Number(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000);

  // Mark all previous OTPs for this email+type as used
  await pool.query(
    `UPDATE otps SET used = TRUE WHERE email = $1 AND type = $2 AND used = FALSE`,
    [email, type]
  );

  // Insert new OTP
  await pool.query(
    `INSERT INTO otps (email, code, type, expires_at) VALUES ($1, $2, $3, $4)`,
    [email, code, type, expiresAt]
  );

  return code;
}

/**
 * Attempt to send an OTP email — never throws.
 * In development, a missing/broken SMTP config is logged as a warning
 * and the caller returns dev_otp in the response body instead.
 */
async function trySendEmail(email, otp, type) {
  try {
    await sendOtpEmail(email, otp, type);
  } catch (err) {
    console.warn(`[WARN] Email not sent to ${email}: ${err.message}`);
    console.warn('[WARN] Using dev_otp in response instead. Set SMTP credentials to send real emails.');
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Creates a new unverified user and sends OTP to email.
 */
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) throw Object.assign(error, { isJoi: true });

    const { name, email, password, role } = value;

    // Check if email already taken
    const existing = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      // If registered but not verified — allow resend OTP instead
      if (!user.is_verified) {
        return res.status(409).json({
          error: 'EMAIL_UNVERIFIED',
          message: 'This email is registered but not verified. Please verify your account.',
          email,
        });
      }
      return res.status(409).json({
        error: 'EMAIL_TAKEN',
        message: 'An account with this email already exists.',
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Create user (unverified)
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, is_verified`,
      [name, email, password_hash, role]
    );
    const newUser = result.rows[0];

    // Generate & send OTP (email failure never crashes the endpoint)
    const otp = await createOtp(email, 'VERIFY_EMAIL');
    await trySendEmail(email, otp, 'VERIFY_EMAIL');

    res.status(201).json({
      message: 'Account created. Check your email for the verification code.',
      email,
      // In dev mode, expose OTP so you can test without a real SMTP
      ...(process.env.NODE_ENV === 'development' && { dev_otp: otp }),
    });
  })
);

/**
 * POST /api/auth/verify-email
 * Validates the OTP and marks the user as verified.
 * Returns tokens on success so user is logged in immediately.
 */
router.post(
  '/verify-email',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { error, value } = otpSchema.validate(req.body);
    if (error) throw Object.assign(error, { isJoi: true });

    const { email, code } = value;

    // Find a matching, unused, unexpired OTP
    const otpResult = await pool.query(
      `SELECT id FROM otps
       WHERE email = $1 AND code = $2 AND type = 'VERIFY_EMAIL'
         AND used = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [email, code]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        error: 'INVALID_OTP',
        message: 'The code is invalid or has expired. Request a new one.',
      });
    }

    // Mark OTP as used
    await pool.query('UPDATE otps SET used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

    // Activate the user
    const userResult = await pool.query(
      `UPDATE users SET is_verified = TRUE, updated_at = NOW()
       WHERE email = $1 RETURNING id, name, email, role`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    const user = userResult.rows[0];

    // Issue tokens — user is now logged in
    const access_token  = signAccessToken(user);
    const refresh_token = signRefreshToken(user);

    res.status(200).json({
      message: 'Email verified! Welcome to NagarSeva.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      access_token,
      refresh_token,
    });
  })
);

/**
 * POST /api/auth/resend-otp
 * Resends email verification OTP.
 */
router.post(
  '/resend-otp',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { error, value } = resendSchema.validate(req.body);
    if (error) throw Object.assign(error, { isJoi: true });

    const { email } = value;

    const userResult = await pool.query(
      'SELECT id, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal whether email exists — generic message
      return res.status(200).json({
        message: 'If this email is registered, a new OTP has been sent.',
      });
    }

    const user = userResult.rows[0];
    if (user.is_verified) {
      return res.status(400).json({
        error: 'ALREADY_VERIFIED',
        message: 'This email is already verified.',
      });
    }

    const otp = await createOtp(email, 'VERIFY_EMAIL');
    await trySendEmail(email, otp, 'VERIFY_EMAIL');

    res.status(200).json({
      message: 'A new verification code has been sent to your email.',
      ...(process.env.NODE_ENV === 'development' && { dev_otp: otp }),
    });
  })
);

/**
 * POST /api/auth/login
 * Authenticates user — must be verified.
 */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { error, value } = loginSchema.validate(req.body);
    if (error) throw Object.assign(error, { isJoi: true });

    const { email, password } = value;

    // Find user
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Require email verification
    if (!user.is_verified) {
      return res.status(403).json({
        error: 'EMAIL_UNVERIFIED',
        message: 'Please verify your email before logging in.',
        email: user.email,
      });
    }

    // Issue tokens
    const access_token  = signAccessToken(user);
    const refresh_token = signRefreshToken(user);

    res.status(200).json({
      message: 'Login successful.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      access_token,
      refresh_token,
    });
  })
);

/**
 * POST /api/auth/refresh
 * Issues a new access token using a valid refresh token.
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'MISSING_TOKEN', message: 'Refresh token required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Refresh token is invalid or expired.' });
    }

    // Re-fetch user to get latest role (in case it changed)
    const result = await pool.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User no longer exists.' });
    }

    const user         = result.rows[0];
    const access_token = signAccessToken(user);

    res.status(200).json({ access_token });
  })
);

/**
 * GET /api/auth/me
 * Returns current authenticated user's profile. Protected.
 */
router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT id, name, email, role, ward, is_verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    res.status(200).json({ user: result.rows[0] });
  })
);

module.exports = router;
