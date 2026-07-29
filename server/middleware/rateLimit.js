// Simple in-memory rate limiter — no external dependencies.
// Uses a sliding window per IP with automatic cleanup.

const windows = new Map(); // ip → { count, resetAt }

// Cleanup stale entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of windows) {
    if (now > entry.resetAt) windows.delete(ip);
  }
}, 5 * 60 * 1000).unref();

/**
 * Creates an Express middleware that limits requests per IP.
 *
 * @param {object} opts
 * @param {number} opts.windowMs - Time window in milliseconds (default: 60_000)
 * @param {number} opts.max - Max requests per window (default: 30)
 * @param {string} opts.message - Error message on limit exceeded
 */
export function rateLimit({ windowMs = 60_000, max = 30, message = "Too many requests, please try again later." } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();

    let entry = windows.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(ip, entry);
    }

    entry.count++;

    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    next();
  };
}
