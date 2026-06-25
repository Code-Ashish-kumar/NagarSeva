/**
 * src/config/gemini.js
 *
 * Wraps the Google GenAI SDK for civic complaint analysis.
 * Model priority: gemini-2.5-flash (generous free tier) →
 *                 gemini-2.5-flash-lite (fallback, fastest + cheapest)
 *
 * On 429 rate-limit errors, automatically waits the retry delay Google
 * specifies in the response and tries once more before giving up.
 */
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Model cascade — most capable first, lighter model as fallback
const MODEL_CASCADE = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

/** Parse the retryDelay seconds out of a GoogleGenerativeAI error message */
function parseRetryDelay(err) {
  try {
    const match = err.message?.match(/"retryDelay"\s*:\s*"(\d+)s"/);
    if (match) return parseInt(match[1], 10) * 1000;
  } catch { /* ignore */ }
  return 30_000; // default 30 s if we can't parse it
}

/** Sleep for ms milliseconds */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build the prompt text for civic complaint analysis.
 */
function buildPromptText(description, location) {
  const locationText = location
    ? `Location coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${location.address ? ` (${location.address})` : ''}.`
    : 'Location: not provided.';

  return `You are an AI system for a civic issue reporting platform called NagarSeva, used in Indian cities.

Analyse the provided image and classify whether it shows a genuine civic infrastructure issue.

${locationText}
User description: "${description || 'Not provided'}"

Respond ONLY with a valid JSON object matching this exact schema — no markdown, no explanation, just the JSON:

{
  "is_valid_civic_issue": <boolean — true if this is a real civic infrastructure problem visible in the image>,
  "rejection_reason": <string if is_valid_civic_issue is false, otherwise null>,
  "category": <one of: "ROAD_DAMAGE", "WATER_LEAK", "GARBAGE_DUMPING", "STREET_LIGHT_FAILURE", "DRAINAGE_BLOCKAGE", "ENCROACHMENT", "TREE_HAZARD", "SEWAGE_OVERFLOW", "OTHER">,
  "confidence": <float 0.0-1.0 — how confident you are in the category>,
  "severity": <one of: "LOW", "MEDIUM", "HIGH", "CRITICAL">,
  "title": <short 5-10 word title describing the specific issue>,
  "ai_description": <2-3 sentence factual description of what is visible in the image and its civic impact>
}

Rejection criteria (set is_valid_civic_issue to false):
- Image is a selfie, portrait, or does not show infrastructure
- Image is a meme, screenshot, or clearly fabricated
- No visible civic problem in the image
- Image is too blurry to assess
- Unrelated content (food, animals without civic context, etc.)`;
}

/**
 * Try a single model; returns parsed JSON or throws.
 */
async function tryModel(modelName, imageBase64, mimeType, promptText) {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: promptText },
        ],
      },
    ],
  });

  const raw = response.text.trim();
  // Strip optional markdown code fences
  const clean = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(clean);
}

/**
 * Analyse a civic complaint image with optional description and location context.
 *
 * @param {string} imageBase64   - Base64-encoded image (no data-URI prefix)
 * @param {string} mimeType      - MIME type, e.g. "image/jpeg"
 * @param {string} [description] - User-supplied description
 * @param {{ lat: number, lng: number, address?: string }} [location]
 *
 * @returns {Promise<object>} Structured analysis JSON
 */
async function analyzeComplaint(imageBase64, mimeType, description = '', location = null) {
  const promptText = buildPromptText(description, location);

  for (const modelName of MODEL_CASCADE) {
    try {
      const parsed = await tryModel(modelName, imageBase64, mimeType, promptText);
      console.log(`[gemini] analysed with ${modelName}`);
      return parsed;
    } catch (err) {
      const is429 = err.message?.includes('429') || err.status === 429;
      const is404 = err.message?.includes('404') || err.status === 404;

      // If model not found, cascade to next model immediately
      if (is404) {
        console.warn(`[gemini] ${modelName} not found (404) — trying next model…`);
        continue;
      }

      if (is429) {
        const delayMs = parseRetryDelay(err);
        console.warn(`[gemini] ${modelName} rate-limited — waiting ${delayMs / 1000}s then retrying once…`);
        await sleep(delayMs);

        try {
          const parsed = await tryModel(modelName, imageBase64, mimeType, promptText);
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

      // Non-429/404 error — don't cascade, surface it immediately
      throw err;
    }
  }

  // All models exhausted
  throw Object.assign(
    new Error('All Gemini models are currently rate-limited. Please wait a few minutes and try again.'),
    { code: 'GEMINI_RATE_LIMITED' }
  );
}

module.exports = { analyzeComplaint };
