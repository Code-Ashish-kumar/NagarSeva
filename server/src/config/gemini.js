/**
 * src/config/gemini.js
 *
 * Wraps the Google GenAI SDK for civic complaint analysis.
 * Model priority: gemini-2.5-flash (generous free tier) →
 *                 gemini-2.5-flash-lite (fallback, fastest + cheapest)
 *
 * Supports multiple images per request for richer analysis.
 */
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Model cascade — most capable first, lighter model as fallback
const MODEL_CASCADE = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

/** Parse the retryDelay seconds out of an error message */
function parseRetryDelay(err) {
  try {
    const match = err.message?.match(/"retryDelay"\s*:\s*"(\d+)s"/);
    if (match) return parseInt(match[1], 10) * 1000;
  } catch { /* ignore */ }
  return 30_000;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build the prompt text for civic complaint analysis.
 */
function buildPromptText(description, location, imageCount) {
  const locationText = location
    ? `Location coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${location.address ? ` (${location.address})` : ''}.`
    : 'Location: not provided.';

  const imageNote = imageCount > 1
    ? `You have been provided ${imageCount} images of the same civic issue from different angles. Analyse ALL images together to form a comprehensive assessment.`
    : 'Analyse the provided image and classify whether it shows a genuine civic infrastructure issue.';

  return `You are an AI system for a civic issue reporting platform called NagarSeva, used in Indian cities.

${imageNote}

${locationText}
User description: "${description || 'Not provided'}"

Respond ONLY with a valid JSON object matching this exact schema — no markdown, no explanation, just the JSON:

{
  "is_valid_civic_issue": <boolean — true if this is a real civic infrastructure problem visible in the image(s)>,
  "rejection_reason": <string if is_valid_civic_issue is false, otherwise null>,
  "category": <one of: "POTHOLE", "STREETLIGHT", "SEWAGE", "GARBAGE", "WATER_SUPPLY", "ROAD_DAMAGE", "ENCROACHMENT", "STRAY_ANIMALS", "DEAD_ANIMAL", "PUBLIC_TOILET", "DRAIN_BLOCKAGE", "FALLEN_TREE", "ABANDONED_VEHICLE", "AIR_POLLUTION", "OTHER">,
  "confidence": <float 0.0-1.0 — how confident you are in the category>,
  "severity": <one of: "LOW", "MEDIUM", "HIGH", "CRITICAL">,
  "title": <short 5-10 word title describing the specific issue>,
  "ai_description": <2-3 sentence factual description of what is visible in the image(s) and its civic impact>
}

Rejection criteria (set is_valid_civic_issue to false):
- Image is a selfie, portrait, or does not show infrastructure
- Image is a meme, screenshot, or clearly fabricated
- No visible civic problem in the image
- Image is too blurry to assess
- Unrelated content (food, animals without civic context, etc.)`;
}

/**
 * Try a single model with multiple images; returns parsed JSON or throws.
 */
async function tryModel(modelName, imageList, promptText) {
  // Build parts: all images first, then the text prompt
  const parts = imageList.map((img) => ({
    inlineData: { data: img.imageBase64, mimeType: img.mimeType },
  }));
  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts }],
  });

  const raw = response.text.trim();
  const clean = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(clean);
}

/**
 * Analyse civic complaint image(s) with optional description and location.
 *
 * @param {Array<{ imageBase64: string, mimeType: string }>} imageList
 * @param {string} [description]
 * @param {{ lat: number, lng: number, address?: string }} [location]
 *
 * @returns {Promise<object>} Structured analysis JSON
 */
async function analyzeComplaint(imageList, description = '', location = null) {
  const promptText = buildPromptText(description, location, imageList.length);

  for (const modelName of MODEL_CASCADE) {
    try {
      const parsed = await tryModel(modelName, imageList, promptText);
      console.log(`[gemini] analysed ${imageList.length} image(s) with ${modelName}`);
      return parsed;
    } catch (err) {
      const is429 = err.message?.includes('429') || err.status === 429;
      const is404 = err.message?.includes('404') || err.status === 404;

      if (is404) {
        console.warn(`[gemini] ${modelName} not found (404) — trying next model…`);
        continue;
      }

      if (is429) {
        const delayMs = parseRetryDelay(err);
        console.warn(`[gemini] ${modelName} rate-limited — waiting ${delayMs / 1000}s then retrying once…`);
        await sleep(delayMs);

        try {
          const parsed = await tryModel(modelName, imageList, promptText);
          console.log(`[gemini] retry succeeded with ${modelName}`);
          return parsed;
        } catch (retryErr) {
          const retry429 = retryErr.message?.includes('429') || retryErr.status === 429;
          if (retry429) {
            console.warn(`[gemini] ${modelName} still rate-limited after retry — trying next model…`);
            continue;
          }
          throw retryErr;
        }
      }

      throw err;
    }
  }

  throw Object.assign(
    new Error('All Gemini models are currently rate-limited. Please wait a few minutes and try again.'),
    { code: 'GEMINI_RATE_LIMITED' }
  );
}

module.exports = { analyzeComplaint };
