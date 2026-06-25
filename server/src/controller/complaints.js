/**
 * src/controller/complaints.js
 *
 * Handles complaint-related API logic.
 * Current scope: AI analysis only — no DB persistence yet.
 */
const { analyzeComplaint } = require('../config/gemini');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/complaints/analyze
 *
 * Body:
 *   imageBase64  {string}  — Base64 image (no data-URI prefix)
 *   mimeType     {string}  — e.g. "image/jpeg"
 *   description  {string}  — optional user text
 *   location     {object}  — optional { lat, lng, address }
 *
 * Returns: the structured AI analysis JSON.
 */
const analyze = asyncHandler(async (req, res) => {
  const { imageBase64, mimeType, description, location } = req.body;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'MISSING_IMAGE', message: 'imageBase64 is required.' });
  }

  if (!mimeType || !mimeType.startsWith('image/')) {
    return res.status(400).json({ error: 'INVALID_MIME', message: 'A valid image mimeType is required.' });
  }

  // Rough size guard: base64 of a 10MB image ≈ 13.3MB string
  if (imageBase64.length > 14_000_000) {
    return res.status(413).json({ error: 'IMAGE_TOO_LARGE', message: 'Image must be under 10MB.' });
  }

  try {
    const result = await analyzeComplaint(
      imageBase64,
      mimeType,
      description || '',
      location || null
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error('[complaints/analyze] AI error:', err.message);

    if (err.code === 'GEMINI_RATE_LIMITED') {
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'AI service is busy. Please try again shortly.' });
    }

    return res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI analysis is temporarily unavailable. Please try again in a moment.' });
  }
});

module.exports = { analyze };
