import {
  createSession,
  generateIntro,
  generateNextQuestion,
  evaluateAnswer,
  generateFollowUp,
  generateReport,
} from "../services/interview-graph.js";
import { analyzeGithubRepos } from "../services/github.js";
import { synthesize } from "../services/tts.js";
import redis from "../services/redis.js";
import { metrics } from "../services/metrics.js";
import jwt from "jsonwebtoken";

// ─────────────────────────────────────────────────────────────────────────────
// Session storage abstraction
//
// When REDIS_URL is set:
//   - Session state JSON   →  Redis string key  `session:<id>`  (TTL = duration + 10 min)
//
// When REDIS_URL is NOT set (redis === null):
//   - Everything falls back to the in-memory Map below (original behaviour)
//
// preNextPromise is always kept in localPromises — Promises are not serialisable
// and the pre-gen is a latency optimisation, not critical state. If the server
// handling a "next" message didn't run the pre-gen (different instance or restart),
// it falls back to generating synchronously — which is already the fallback path.
// ─────────────────────────────────────────────────────────────────────────────

// Fallback in-memory store (used when Redis is not configured)
const memSessions = new Map();

// Local ephemeral store for non-serialisable Promises only (all instances)
const localPromises = new Map(); // sessionId → Promise<{action, audio}|null>

// TTL: interview duration (minutes) converted to seconds, plus 10 minute grace period
function sessionTTL(durationMin) {
  return durationMin * 60 + 600;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function sessionGet(sessionId) {
  if (!redis) return memSessions.get(sessionId) ?? null;
  const raw = await redis.get(`session:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

async function sessionSet(sessionId, session) {
  if (!redis) {
    // In-memory path: keep the full entry
    const existing = memSessions.get(sessionId) ?? {};
    memSessions.set(sessionId, { ...existing, session });
    return;
  }
  const ttl = sessionTTL(session.duration ?? 30);
  await redis.set(`session:${sessionId}`, JSON.stringify(session), "EX", ttl);
}

async function sessionDelete(sessionId) {
  if (!redis) { memSessions.delete(sessionId); return; }
  await redis.del(`session:${sessionId}`);
}

function clearSessionState(sessionId) {
  if (!sessionId) return;
  localPromises.delete(sessionId);
  localPromises.delete(`${sessionId}:evalTs`);
  metrics.clearRequest(sessionId);
}



// ─────────────────────────────────────────────────────────────────────────────

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

// Pre-generate next question + TTS during feedback reading window.
// Reads its own fresh session copy to avoid lost-update races with the
// message handler's session reference (F3 fix).
function startPreGen(action, sessionId) {
  const promise = (async () => {
    try {
      const session = await sessionGet(sessionId);
      if (!session) return null;

      if (action === "followup") {
        await generateFollowUp(session);
        await sessionSet(sessionId, session);
        const audio = await synthesize(session.currentFollowUp.question);
        return { action, audio };
      } else {
        const q = await generateNextQuestion(session);
        await sessionSet(sessionId, session);
        const audio = await synthesize(q.question);
        return { action, audio };
      }
    } catch (err) {
      console.warn("Pre-gen failed:", err.message);
      return null;
    }
  })();
  localPromises.set(sessionId, promise);
  return promise;
}

export function handleInterviewSocket(ws, req) {
  // Verify JWT from query params — browser WS API doesn't support custom headers
  let userId = null;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) throw new Error("No token provided");
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    userId = payload.id; // Kept for future per-user session scoping
  } catch {
    ws.close(4401, "Authentication required");
    return;
  }

  let sessionId = null;

  // Liveness detection — ping/pong pattern (F12 fix).
  // If the client doesn't respond with a pong before the next sweep,
  // the connection is considered dead and is terminated.
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  const pingInterval = setInterval(() => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    if (ws.readyState === 1) ws.ping();
  }, 25000);

  ws.on("message", async (raw) => {
    // TOP-LEVEL try-catch: any unhandled error sends an error message instead of crashing
    try {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      const { type, ...data } = msg;

      // ── start ────────────────────────────────────────────────────────
      if (type === "start") {
        sessionId = crypto.randomUUID();
        const endTTFQ = metrics.startTimer(sessionId, "ttfq");  // Time-to-First-Question
        const session = createSession(
          data.resume,
          data.jobDescription,
          data.duration ?? 30
        );

        // GitHub enrichment + intro generation run in parallel
        const githubPromise = (async () => {
          const endGH = metrics.startTimer(sessionId, "github_enrichment_total");
          const urls = (data.resume?.projects ?? []).map((p) => p.github_url).filter(Boolean);
          if (urls.length > 0) {
            try {
              session.githubProjects = await analyzeGithubRepos(urls);
              console.log(`GitHub: enriched ${session.githubProjects.length}/${urls.length} projects`);
              endGH({ found: session.githubProjects.length, total: urls.length });
            } catch (err) {
              console.warn("GitHub enrichment failed:", err.message);
              endGH({ error: err.message });
            }
          } else {
            endGH({ skipped: true });
          }
        })();

        const endIntro = metrics.startTimer(sessionId, "llm_intro");
        const [introSpeech] = await Promise.all([generateIntro(session), githubPromise]);
        endIntro();
        const introAudio = await synthesize(introSpeech, { sessionId });

        // Persist session to Redis (or in-memory Map as fallback).
        if (!redis) {
          memSessions.set(sessionId, { session });
        } else {
          await sessionSet(sessionId, session);
        }

        const ttfqMs = endTTFQ();
        console.log(`[METRIC] TTFQ=${ttfqMs}ms for session ${sessionId}`);
        send(ws, "session_ready", { sessionId });
        send(ws, "intro", { audio: introAudio });
        // Note: Q1 is NOT pre-generated here. It's generated AFTER the candidate
        // intro so it can reference what they said.
        return;
      }

      // ── resume (reconnect to existing session) ──────────────────────
      if (type === "resume") {
        const requestedId = data.sessionId;
        if (!requestedId) { send(ws, "error", { message: "No sessionId provided" }); return; }

        const session = await sessionGet(requestedId);
        if (!session) {
          send(ws, "resume_failed", { reason: "Session expired or not found" });
          return;
        }

        sessionId = requestedId;
        console.log(`Session ${sessionId} resumed (${session.evaluations?.length ?? 0} answers completed)`);

        // Build a state snapshot so the client can restore its UI
        const elapsedMs = session.sessionStartTime ? Date.now() - session.sessionStartTime : 0;
        const remainingMin = Math.max(0, session.duration - Math.floor(elapsedMs / 60000));

        send(ws, "resume_ok", {
          sessionId,
          questionsAnswered: session.evaluations?.length ?? 0,
          currentQuestion: session.currentQuestion,
          currentFollowUp: session.currentFollowUp,
          nextAction: session.nextAction,
          elapsed: Math.floor(elapsedMs / 60000),
          duration: session.duration,
          remainingMin,
        });
        return;
      }

      // ── all subsequent handlers need a session ────────────────────────
      const session = await sessionGet(sessionId);
      if (!session) { send(ws, "error", { message: "Session not found" }); return; }

      // ── candidate intro (not scored) ─────────────────────────────────
      if (type === "candidate_intro") {
        const transcript = data.transcript ?? "";

        session.candidateIntro = transcript;
        console.log("Candidate intro received, generating Q1 with intro context...");

        // Generate Q1 NOW with the candidate's actual intro as context
        const q1 = await generateNextQuestion(session);
        const q1Audio = await synthesize(q1.question);

        // Persist session with intro + Q1 recorded on it
        await sessionSet(sessionId, session);

        send(ws, "question", {
          question: q1,
          index: 0,
          elapsed: 0,
          duration: session.duration,
          audio: q1Audio,
        });
        return;
      }

      // ── answer done ──────────────────────────────────────────────────
      if (type === "answer_done") {
        const transcript = data.transcript ?? "";

        if (!transcript.trim()) {
          send(ws, "error", { message: "No transcript received. Please say more." });
          return;
        }

        send(ws, "transcript_confirmed", { transcript });
        session.currentAnswer = transcript;

        const endEval = metrics.startTimer(sessionId, "llm_evaluation");
        const { evaluation } = await evaluateAnswer(session);
        endEval();

        const elapsedMs = session.sessionStartTime ? Date.now() - session.sessionStartTime : 0;
        const remainingMin = Math.max(0, session.duration - Math.floor(elapsedMs / 60000));

        // Persist updated session (evaluations + nextAction written by evaluateAnswer)
        await sessionSet(sessionId, session);

        // Track when evaluation was sent — used to calculate pre-gen timing
        const evaluationSentAt = Date.now();
        send(ws, "evaluation", { evaluation, remainingMin });

        // Start pre-generating in the background while user reads evaluation
        if (session.nextAction !== "done") {
          startPreGen(session.nextAction, sessionId);
          // Store evaluation send time for pre-gen hit rate calculation
          localPromises.set(`${sessionId}:evalTs`, evaluationSentAt);
        }
        return;
      }

      // ── next ─────────────────────────────────────────────────────────
      if (type === "next") {
        const elapsedMs = session.sessionStartTime ? Date.now() - session.sessionStartTime : 0;
        const remainingMin = Math.max(0, session.duration - Math.floor(elapsedMs / 60000));

        if (session.nextAction === "done") {
          send(ws, "status", { message: "Generating your report..." });
          await generateReport(session);
          send(ws, "report", { report: session.report });
          await sessionDelete(sessionId);
          clearSessionState(sessionId);
          return;
        }

        // Await pre-generated content — instant if the Promise finished during
        // the evaluation reading window, a short wait if still running, null if
        // pre-gen wasn't run on this instance (different server after reconnect).
        const prePromise = localPromises.get(sessionId) ?? null;
        const evaluationSentAt = localPromises.get(`${sessionId}:evalTs`) ?? Date.now();
        localPromises.delete(sessionId);
        localPromises.delete(`${sessionId}:evalTs`);
        const pre = prePromise ? await prePromise : null;
        const userReadTimeMs = Date.now() - evaluationSentAt;

        // ── Pre-gen hit rate tracking ──────────────────────────────────
        const preGenHit = pre !== null && pre.action === session.nextAction;
        metrics.record(sessionId, "pregen_hit", {
          hit: preGenHit,
          userReadTimeMs,
          action: session.nextAction,
        });
        console.log(`[METRIC] preGenHit=${preGenHit}, userReadTime=${userReadTimeMs}ms, action=${session.nextAction}`);

        // Re-read session after pre-gen may have mutated + persisted it
        const freshSession = await sessionGet(sessionId);
        // Use freshSession if available, fall back to the session read at top
        // (pre-gen always persists, so freshSession should have the updated state)
        const s = freshSession ?? session;

        if (s.nextAction === "followup") {
          if (pre?.action === "followup") {
            // Pre-gen ready — send immediately (zero TTS delay)
            send(ws, "followup", {
              question: s.currentFollowUp,
              index: s.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: s.duration,
              audio: pre.audio,
            });
          } else {
            // Pre-gen failed or ran on another instance — generate now
            if (!s.currentFollowUp) await generateFollowUp(s);
            const audio = await synthesize(s.currentFollowUp.question);
            await sessionSet(sessionId, s);
            send(ws, "followup", {
              question: s.currentFollowUp,
              index: s.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: s.duration,
              audio,
            });
          }
        } else {
          if (pre?.action === "next") {
            // Pre-gen ready — send immediately
            send(ws, "question", {
              question: s.currentQuestion,
              index: s.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: s.duration,
              audio: pre.audio,
            });
          } else {
            // Pre-gen failed or ran on another instance — generate now
            if (pre === null && s.questions.length === s.evaluations.filter(e => !e.isFollowUp).length) {
              await generateNextQuestion(s);
            }
            const audio = await synthesize(s.currentQuestion.question);
            await sessionSet(sessionId, s);
            send(ws, "question", {
              question: s.currentQuestion,
              index: s.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: s.duration,
              audio,
            });
          }
        }
        return;
      }

      if (type === "ping") { send(ws, "pong"); return; }

    } catch (err) {
      console.error("WS handler error:", err);
      send(ws, "error", { message: "Something went wrong on the server. Please try again." });
    }
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    clearSessionState(sessionId);
    // Session keys are intentionally NOT deleted from Redis on disconnect.
    // A 5-minute grace period (covered by the TTL already set) allows the
    // client to reconnect and resume. The TTL handles cleanup automatically.
    // For the in-memory fallback, we delete immediately (no reconnection support).
    if (!redis && sessionId) memSessions.delete(sessionId);
  });

  ws.on("error", (err) => console.error("WS error:", err.message));
}
