import redis from "./redis.js";

// Shared interview-session store. Backed by Redis when REDIS_URL is set (so
// any server instance can service a reconnect and a restart doesn't lose
// in-progress interviews); falls back to an in-memory Map for local dev.
const RECOVERY_WINDOW_MS = 10 * 60_000; // 10 minutes of inactivity
const RECOVERY_WINDOW_SEC = RECOVERY_WINDOW_MS / 1000;

const memory = new Map(); // sessionId → { session, updatedAt }  (fallback only)

function keyFor(sessionId) {
  return `interview:session:${sessionId}`;
}

export async function sessionGet(sessionId) {
  if (redis) {
    const raw = await redis.get(keyFor(sessionId));
    return raw ? JSON.parse(raw) : null;
  }
  const entry = memory.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > RECOVERY_WINDOW_MS) {
    memory.delete(sessionId);
    return null;
  }
  return entry.session;
}

// Persists the current state of `session` and refreshes its TTL. Call this
// after every meaningful mutation — with Redis, mutating the in-process
// object does NOT persist on its own, so this is the only thing keeping a
// remote copy in sync (this also replaces what used to be a separate
// "touch" that only bumped a timestamp).
export async function sessionSave(sessionId, session) {
  if (redis) {
    await redis.set(keyFor(sessionId), JSON.stringify(session), "EX", RECOVERY_WINDOW_SEC);
    return;
  }
  memory.set(sessionId, { session, updatedAt: Date.now() });
}

export async function sessionDelete(sessionId) {
  if (redis) {
    await redis.del(keyFor(sessionId));
    return;
  }
  memory.delete(sessionId);
}

// Sweep out anything past the recovery window so abandoned interviews don't
// accumulate in memory forever. Only needed for the in-memory fallback —
// Redis evicts via TTL natively.
export function startSessionSweep() {
  if (redis) return;
  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of memory) {
      if (now - entry.updatedAt > RECOVERY_WINDOW_MS) memory.delete(id);
    }
  }, 60_000).unref();
}
