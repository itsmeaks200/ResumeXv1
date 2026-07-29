import { stripJson } from "./groq.js";

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
