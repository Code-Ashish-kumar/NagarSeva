/**
 * src/config/gemini.js
 *
 * AI-powered civic complaint analysis using Groq (Llama 4 Scout).
 * Uses the OpenAI-compatible Groq API for fast multimodal inference.
 *
 * Model: meta-llama/llama-4-scout-17b-16e-instruct
 *   - Natively multimodal (image + text)
 *   - 128K context window
 *   - Supports JSON mode
 *   - Up to 5 images per request
 *   - 460+ tokens/sec on Groq hardware
 *
 * Retry strategy: Exponential backoff with full jitter on 429/503 errors.
 */
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// Retry configuration
const MAX_RETRIES   = 4;
const BASE_DELAY_MS = 2000;     // 2s base
const MAX_DELAY_MS  = 30000;    // cap at 30s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Exponential backoff with full jitter.
 * Prevents thundering herd when multiple requests retry simultaneously.
 */
function getBackoffDelay(attempt) {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
  return Math.random() * cappedDelay;
}

/**
 * Build the system + user prompt for civic complaint analysis.
 */
function buildPrompt(description, location, imageCount) {
  const locationText = location
    ? `Location coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${location.address ? ` (${location.address})` : ''}.`
    : 'Location: not provided.';

  const imageNote = imageCount > 1
    ? `You have been provided ${imageCount} images of the same civic issue from different angles. Analyse ALL images together to form a comprehensive assessment.`
    : 'Analyse the provided image and classify whether it shows a genuine civic infrastructure issue.';

  const systemPrompt = `You are an AI system for a civic issue reporting platform called NagarSeva, used in Indian cities. You analyse images of civic infrastructure problems and return structured JSON assessments.`;

  const userPrompt = `${imageNote}

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

  return { systemPrompt, userPrompt };
}

/**
 * Call the Groq API with images and prompt.
 */
async function callGroq(imageList, systemPrompt, userPrompt) {
  // Build content array: images as base64 data URIs + text prompt
  const content = imageList.map((img) => ({
    type: 'image_url',
    image_url: {
      url: `data:${img.mimeType};base64,${img.imageBase64}`,
    },
  }));
  content.push({ type: 'text', text: userPrompt });

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    temperature: 0.3,
    max_completion_tokens: 1024,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response from Groq');

  // Strip optional markdown fences (shouldn't happen with json_object mode, but just in case)
  const clean = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(clean);
}

/**
 * Analyse civic complaint image(s) with optional description and location.
 * Implements exponential backoff with jitter on transient errors.
 *
 * @param {Array<{ imageBase64: string, mimeType: string }>} imageList
 * @param {string} [description]
 * @param {{ lat: number, lng: number, address?: string }} [location]
 *
 * @returns {Promise<object>} Structured analysis JSON
 */
async function analyzeComplaint(imageList, description = '', location = null) {
  const { systemPrompt, userPrompt } = buildPrompt(description, location, imageList.length);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const parsed = await callGroq(imageList, systemPrompt, userPrompt);
      if (attempt > 0) {
        console.log(`[groq] succeeded on retry #${attempt}`);
      } else {
        console.log(`[groq] analysed ${imageList.length} image(s) with ${MODEL}`);
      }
      return parsed;
    } catch (err) {
      const status = err?.status || err?.statusCode;
      const is429 = status === 429 || err.message?.includes('429');
      const is503 = status === 503 || err.message?.includes('503');
      const is500 = status === 500;

      // Retryable errors: rate limit, service unavailable, internal error
      if (is429 || is503 || is500) {
        if (attempt === MAX_RETRIES) {
          console.error(`[groq] all ${MAX_RETRIES} retries exhausted`);
          throw Object.assign(
            new Error('AI service is currently busy. Please try again in a few minutes.'),
            { code: 'AI_RATE_LIMITED' }
          );
        }

        const delayMs = getBackoffDelay(attempt);
        console.warn(
          `[groq] ${status || 'error'} — retry ${attempt + 1}/${MAX_RETRIES} in ${(delayMs / 1000).toFixed(1)}s`
        );
        await sleep(delayMs);
        continue;
      }

      // Non-retryable error — throw immediately
      throw err;
    }
  }
}

module.exports = { analyzeComplaint };
