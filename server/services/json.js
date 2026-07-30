import { chat, stripJson } from "./groq.js";

export function parseValidatedJson(raw, label, validate) {
  let parsed;

  try {
    parsed = JSON.parse(stripJson(raw));
  } catch (err) {
    throw new Error(`${label} JSON parse failed: ${err.message}`);
  }

  if (validate) validate(parsed);
  return parsed;
}

// LLM calls occasionally return malformed/incomplete JSON (truncation, a
// stray field). Retrying the whole generate+validate cycle a couple of
// times resolves the vast majority of these transiently, instead of
// failing the whole request on a single hiccup.
export async function chatJson(prompt, systemPrompt, label, validate, { retries = 2, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await chat(prompt, systemPrompt);
      return parseValidatedJson(raw, label, validate);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`${label} generation failed (attempt ${attempt + 1}/${retries + 1}): ${err.message}`);
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

export function ensureString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function ensureNumber(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
}

export function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

export function ensureStringArray(value, label) {
  ensureArray(value, label);
  value.forEach((item, index) => ensureString(item, `${label}[${index}]`));
}
