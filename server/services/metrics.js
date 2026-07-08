// ─────────────────────────────────────────────────────────────────────────────
// Lightweight latency & reliability metrics for GenAI pipeline stages.
//
// Usage:
//   import { metrics } from "./metrics.js";
//
//   const end = metrics.startTimer("sessionId", "tts_gemini");
//   await synthesizeGemini(text);
//   end();                              // records duration
//   end({ hit: true, provider: "gemini" }); // optional metadata
//
//   metrics.record("sessionId", "json_parse", { success: true });
//   metrics.record("sessionId", "pregen_hit", { hit: true, waitMs: 0 });
//
//   metrics.getSummary();  // { stages: { tts_gemini: { p50, p95, mean, count } }, ... }
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 1000; // ring buffer size per stage

class Metrics {
  constructor() {
    /** @type {Map<string, Array<{duration: number, ts: number, sessionId: string, meta?: object}>>} */
    this.stages = new Map();

    /** @type {Map<string, Map<string, {stage: string, start: number, end?: number, duration?: number}>>} */
    this.requests = new Map(); // sessionId → Map<stage, timing>

    // Counters for simple success/fail tracking
    this.counters = new Map(); // key → { success: number, fail: number }
  }

  /**
   * Start a latency timer for a pipeline stage.
   * Returns a function to call when the stage completes.
   *
   * @param {string} sessionId - Request/session identifier
   * @param {string} stage - Pipeline stage name (e.g. "llm_eval", "tts_gemini")
   * @returns {(meta?: object) => number} - Call to stop timer; returns duration in ms
   */
  startTimer(sessionId, stage) {
    const start = performance.now();

    // Track per-request waterfall
    if (!this.requests.has(sessionId)) this.requests.set(sessionId, new Map());
    this.requests.get(sessionId).set(stage, { stage, start: Date.now() });

    let stopped = false;

    return (meta) => {
      if (stopped) return 0; // idempotent
      stopped = true;

      const duration = Math.round(performance.now() - start);

      // Update per-request entry
      const reqEntry = this.requests.get(sessionId)?.get(stage);
      if (reqEntry) {
        reqEntry.end = Date.now();
        reqEntry.duration = duration;
        if (meta) reqEntry.meta = meta;
      }

      // Append to stage ring buffer
      if (!this.stages.has(stage)) this.stages.set(stage, []);
      const arr = this.stages.get(stage);
      arr.push({ duration, ts: Date.now(), sessionId, ...(meta ? { meta } : {}) });
      if (arr.length > MAX_ENTRIES) arr.shift();

      return duration;
    };
  }

  /**
   * Record a discrete event (success/failure counter).
   *
   * @param {string} sessionId
   * @param {string} key - e.g. "json_parse", "pregen_hit", "tts_fallback"
   * @param {object} data - must include { success: boolean } or { hit: boolean }
   */
  record(sessionId, key, data = {}) {
    if (!this.counters.has(key)) this.counters.set(key, { success: 0, fail: 0, total: 0, meta: [] });
    const c = this.counters.get(key);
    c.total++;
    if (data.success === true || data.hit === true) c.success++;
    else c.fail++;
    c.meta.push({ ts: Date.now(), sessionId, ...data });
    if (c.meta.length > MAX_ENTRIES) c.meta.shift();
  }

  /**
   * Get per-request timing waterfall.
   */
  getRequestTimings(sessionId) {
    const entries = this.requests.get(sessionId);
    if (!entries) return null;
    return Object.fromEntries(entries);
  }

  /**
   * Get aggregate stats for a stage.
   */
  getStageStats(stage) {
    const arr = this.stages.get(stage);
    if (!arr || arr.length === 0) return null;

    const durations = arr.map((e) => e.duration).sort((a, b) => a - b);
    const n = durations.length;

    return {
      count: n,
      mean: Math.round(durations.reduce((a, b) => a + b, 0) / n),
      p50: durations[Math.floor(n * 0.5)],
      p95: durations[Math.floor(n * 0.95)],
      p99: durations[Math.floor(n * 0.99)],
      min: durations[0],
      max: durations[n - 1],
    };
  }

  /**
   * Get counter stats (success rate).
   */
  getCounterStats(key) {
    const c = this.counters.get(key);
    if (!c) return null;
    return {
      total: c.total,
      success: c.success,
      fail: c.fail,
      rate: c.total > 0 ? +(c.success / c.total * 100).toFixed(1) : 0,
    };
  }

  /**
   * Full summary of all tracked metrics.
   */
  getSummary() {
    const stages = {};
    for (const [name] of this.stages) {
      stages[name] = this.getStageStats(name);
    }

    const counters = {};
    for (const [name] of this.counters) {
      counters[name] = this.getCounterStats(name);
    }

    return { stages, counters };
  }

  /**
   * Clean up per-request data for a completed session.
   */
  clearRequest(sessionId) {
    this.requests.delete(sessionId);
  }

  /**
   * Reset all metrics (for testing).
   */
  reset() {
    this.stages.clear();
    this.requests.clear();
    this.counters.clear();
  }
}

// Singleton instance
export const metrics = new Metrics();
export default metrics;
