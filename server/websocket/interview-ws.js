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
import { transcribeAudio } from "../services/groq.js";
import redis from "../services/redis.js";
import jwt from "jsonwebtoken";

// ─────────────────────────────────────────────────────────────────────────────
// Session storage abstraction
//
// When REDIS_URL is set:
//   - Session state JSON   →  Redis string key  `session:<id>`  (TTL = duration + 10 min)
//   - Audio chunk buffers  →  Redis list key     `audio:<id>`    (same TTL)
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
    // In-memory path: keep the full entry (session + audioChunks ref is elsewhere)
    const existing = memSessions.get(sessionId) ?? {};
    memSessions.set(sessionId, { ...existing, session });
    return;
  }
  const ttl = sessionTTL(session.duration ?? 30);
  await redis.set(`session:${sessionId}`, JSON.stringify(session), "EX", ttl);
}

async function sessionDelete(sessionId) {
  if (!redis) { memSessions.delete(sessionId); return; }
  await redis.del(`session:${sessionId}`, `audio:${sessionId}`);
}

// Audio chunks are stored as a Redis list (RPUSH / LRANGE / DEL).
// In-memory path keeps chunks on the Map entry directly.

async function audioChunkPush(sessionId, base64Chunk) {
  if (!redis) {
    const entry = memSessions.get(sessionId);
    if (entry) entry.audioChunks.push(Buffer.from(base64Chunk, "base64"));
    return;
  }
  await redis.rpush(`audio:${sessionId}`, base64Chunk);
  // Refresh TTL on audio key whenever a chunk arrives (session still alive)
  const session = await sessionGet(sessionId);
  if (session) await redis.expire(`audio:${sessionId}`, sessionTTL(session.duration ?? 30));
}

async function audioChunkFlush(sessionId) {
  if (!redis) {
    const entry = memSessions.get(sessionId);
    if (!entry || !entry.audioChunks.length) return null;
    const buf = Buffer.concat(entry.audioChunks);
    entry.audioChunks = [];
    return buf;
  }
  const chunks = await redis.lrange(`audio:${sessionId}`, 0, -1);
  if (!chunks.length) return null;
  await redis.del(`audio:${sessionId}`);
  return Buffer.concat(chunks.map((c) => Buffer.from(c, "base64")));
}

// ─────────────────────────────────────────────────────────────────────────────

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

// Pre-generate next question + TTS during feedback reading window.
// Stores the Promise in localPromises (not Redis — Promises aren't serialisable).
// If another server instance handles the "next" message, it won't find the Promise
// and will fall through to the synchronous generation path, which is already coded.
function startPreGen(session, action, sessionId) {
  const promise = (async () => {
    try {
      if (action === "followup") {
        await generateFollowUp(session);
        // Persist updated session (currentFollowUp was set on session object)
        await sessionSet(sessionId, session);
        const audio = await synthesize(session.currentFollowUp.question);
        return { action, audio };
      } else {
        const q = await generateNextQuestion(session);
        // Persist updated session (currentQuestion was set on session object)
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

  // Keepalive ping to prevent proxy/load-balancer timeouts
  const pingInterval = setInterval(() => {
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
        const session = createSession(
          data.resume,
          data.jobDescription,
          data.duration ?? 30
        );

        // GitHub enrichment + intro generation run in parallel
        const githubPromise = (async () => {
          const urls = (data.resume?.projects ?? []).map((p) => p.github_url).filter(Boolean);
          if (urls.length > 0) {
            try {
              session.githubProjects = await analyzeGithubRepos(urls);
              console.log(`GitHub: enriched ${session.githubProjects.length}/${urls.length} projects`);
            } catch (err) {
              console.warn("GitHub enrichment failed:", err.message);
            }
          }
        })();

        const [introSpeech] = await Promise.all([generateIntro(session), githubPromise]);
        const introAudio = await synthesize(introSpeech);

        // Persist session to Redis (or in-memory Map as fallback).
        // Also initialise the in-memory Map entry for the audio chunk accumulator
        // when running without Redis.
        if (!redis) {
          memSessions.set(sessionId, { session, audioChunks: [] });
        } else {
          await sessionSet(sessionId, session);
          // No in-memory audioChunks entry needed — chunks go to Redis list
        }

        send(ws, "session_ready", { sessionId });
        send(ws, "intro", { audio: introAudio });
        // Note: Q1 is NOT pre-generated here. It's generated AFTER the candidate
        // intro so it can reference what they said.
        return;
      }

      // ── all subsequent handlers need a session ────────────────────────
      const session = await sessionGet(sessionId);
      if (!session) { send(ws, "error", { message: "Session not found" }); return; }

      // ── audio chunk ──────────────────────────────────────────────────
      if (type === "audio_chunk") {
        await audioChunkPush(sessionId, data.chunk);
        return;
      }

      // ── candidate intro (not scored) ─────────────────────────────────
      if (type === "candidate_intro") {
        let transcript = data.transcript ?? "";

        const audioBuf = await audioChunkFlush(sessionId);
        if (audioBuf) {
          try {
            transcript = await transcribeAudio(audioBuf);
          } catch (err) {
            console.warn("Whisper failed for intro:", err.message);
          }
        }

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
        let transcript = data.transcript ?? "";

        const audioBuf = await audioChunkFlush(sessionId);
        if (audioBuf) {
          try {
            transcript = await transcribeAudio(audioBuf);
          } catch (err) {
            console.warn("Whisper failed, using Web Speech:", err.message);
          }
        }

        if (!transcript.trim()) {
          send(ws, "error", { message: "No transcript received. Please say more." });
          return;
        }

        send(ws, "transcript_confirmed", { transcript });
        session.currentAnswer = transcript;

        const { evaluation } = await evaluateAnswer(session);

        const elapsedMs = session.sessionStartTime ? Date.now() - session.sessionStartTime : 0;
        const remainingMin = Math.max(0, session.duration - Math.floor(elapsedMs / 60000));

        // Persist updated session (evaluations + nextAction written by evaluateAnswer)
        await sessionSet(sessionId, session);

        send(ws, "evaluation", { evaluation, remainingMin });

        // Start pre-generating in the background while user reads evaluation
        if (session.nextAction !== "done") {
          startPreGen(session, session.nextAction, sessionId);
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
          localPromises.delete(sessionId);
          return;
        }

        // Await pre-generated content — instant if the Promise finished during
        // the evaluation reading window, a short wait if still running, null if
        // pre-gen wasn't run on this instance (different server after reconnect).
        const prePromise = localPromises.get(sessionId) ?? null;
        localPromises.delete(sessionId);
        const pre = prePromise ? await prePromise : null;

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
    localPromises.delete(sessionId);
    // Session keys are intentionally NOT deleted from Redis on disconnect.
    // A 5-minute grace period (covered by the TTL already set) allows the
    // client to reconnect and resume. The TTL handles cleanup automatically.
    // For the in-memory fallback, we delete immediately (no reconnection support).
    if (!redis && sessionId) memSessions.delete(sessionId);
  });

  ws.on("error", (err) => console.error("WS error:", err.message));
}
