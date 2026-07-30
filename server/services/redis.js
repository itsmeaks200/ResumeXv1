import Redis from "ioredis";

// REDIS_URL is optional.
// If not set, this module exports null and session-store.js falls back to an
// in-memory Map. This keeps the dev experience working without a Redis instance.
let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    // Retry with exponential back-off, up to 10 attempts
    retryStrategy: (times) => Math.min(times * 100, 3000),
    // Don't crash the process on connection errors
    lazyConnect: false,
    enableReadyCheck: true,
  });

  redis.on("connect", () => console.log("Redis connected"));
  redis.on("error", (err) => console.error("Redis error:", err.message));
  redis.on("close", () => console.warn("Redis connection closed"));
} else {
  console.log("REDIS_URL not set — using in-memory session store (single-instance only)");
}

export default redis;
