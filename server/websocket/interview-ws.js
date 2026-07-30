import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import {
  createSession,
  generateIntro,
  generateNextQuestion,
  generateFollowUp,
  evaluateAnswer,
  generateReport,
} from "../services/interview-graph.js";
import { synthesize } from "../services/tts.js";
import { transcribeAudio } from "../services/groq.js";
import { metrics } from "../services/metrics.js";
import Interview from "../models/Interview.js";
import { sessionGet, sessionSave, sessionDelete, startSessionSweep } from "../services/session-store.js";

startSessionSweep();

// Message types that mutate session state — serialized per-connection so a
// double-fired message (flaky retry, double click) can't race against
// itself and corrupt the in-flight session.
const MUTATING_TYPES = new Set(["start", "resume", "intro_done", "answer_done", "retry_advance"]);

// Client-controlled inputs are otherwise unbounded — clamp them so a
// malformed/malicious "start" payload can't blow up prompt size or turn the
// interview's own safety cap into an unbounded LLM-cost bomb.
const ALLOWED_DURATIONS = [15, 30, 60];
const MAX_RESUME_JSON_LEN = 60_000;
const MAX_JD_LEN = 6_000;

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

function decodeAudio(base64) {
  if (!base64) return null;
  try {
    const buf = Buffer.from(base64, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

export function handleInterviewSocket(ws, req) {
  // Verify JWT from query params — browser WS API doesn't support custom headers
  let userId = null;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) throw new Error("No token provided");
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    userId = payload.id;
  } catch {
    ws.close(4401, "Authentication required");
    return;
  }

  let sessionId = null;
  let session = null; // local copy — must be sessionSave()'d after every mutation to stay in sync with Redis
  let busy = false; // guards against overlapping mutating messages on one connection

  // Liveness detection — ping/pong pattern.
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  const pingInterval = setInterval(() => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    if (ws.readyState === 1) ws.ping();
  }, 25000);

  function timeInfo() {
    const elapsedMs = session.sessionStartTime ? Date.now() - session.sessionStartTime : 0;
    return {
      duration: session.duration,
      elapsedSec: Math.floor(elapsedMs / 1000),
      remainingSec: Math.max(0, Math.round(session.duration * 60 - elapsedMs / 1000)),
    };
  }

  async function sendQuestion() {
    const q = await generateNextQuestion(session);
    const audio = await synthesize(q.question, { sessionId });
    await sessionSave(sessionId, session);
    send(ws, "question", {
      question: q,
      index: session.questions.length - 1,
      ...timeInfo(),
      audio,
    });
  }

  async function sendFollowUp() {
    await generateFollowUp(session);
    const q = session.currentFollowUp;
    const audio = await synthesize(q.question, { sessionId });
    await sessionSave(sessionId, session);
    send(ws, "question", {
      question: q,
      index: session.questions.length - 1,
      isFollowUp: true,
      ...timeInfo(),
      audio,
    });
  }

  // Whatever comes after an evaluated answer: the next question, a
  // follow-up probe, or the final report. Pulled into its own function so
  // "retry_advance" can re-attempt exactly this step without re-evaluating
  // the answer that already went through (session.currentQuestion is nulled
  // out before this ever runs — see answer_done — so a retry can never
  // double-score the same answer).
  async function advance() {
    if (session.nextAction === "done") {
      send(ws, "status", { message: "Generating your report..." });
      if (!session.report) {
        await generateReport(session);
        await sessionSave(sessionId, session);
      }

      if (!session.savedInterviewId) {
        try {
          const saved = await Interview.create({
            userId,
            jobDescription: session.jobDescription,
            duration: session.duration,
            report: session.report,
          });
          session.savedInterviewId = saved._id;
          await sessionSave(sessionId, session);
        } catch (err) {
          console.error("Failed to save interview report:", err.message);
        }
      }

      send(ws, "report", { report: session.report, interviewId: session.savedInterviewId ?? null });
      await sessionDelete(sessionId);
      metrics.clearRequest(sessionId);
      session = null;
      return;
    }

    if (session.nextAction === "followup") {
      await sendFollowUp();
    } else {
      await sendQuestion();
    }
  }

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, ...data } = msg;

    if (MUTATING_TYPES.has(type)) {
      if (busy) {
        send(ws, "error", { message: "Still processing your previous request — please wait a moment." });
        return;
      }
      busy = true;
    }

    // TOP-LEVEL try-catch: any unhandled error sends an error message instead of crashing
    try {
      // ── start ────────────────────────────────────────────────────────
      if (type === "start") {
        const duration = ALLOWED_DURATIONS.includes(Number(data.duration)) ? Number(data.duration) : 30;
        const jobDescription = typeof data.jobDescription === "string" ? data.jobDescription.slice(0, MAX_JD_LEN) : "";
        const resumeJsonLen = JSON.stringify(data.resume ?? {}).length;
        if (resumeJsonLen > MAX_RESUME_JSON_LEN) {
          send(ws, "error", { message: "Resume data is too large to start an interview." });
          return;
        }

        sessionId = randomUUID();
        const endTTFQ = metrics.startTimer(sessionId, "ttfq"); // Time-to-First-Question
        session = createSession(data.resume, jobDescription, duration, userId);
        await sessionSave(sessionId, session);

        const endIntro = metrics.startTimer(sessionId, "llm_intro");
        const introSpeech = await generateIntro(session);
        endIntro();
        const introAudio = await synthesize(introSpeech, { sessionId });
        await sessionSave(sessionId, session);

        const ttfqMs = endTTFQ();
        console.log(`[METRIC] TTFQ=${ttfqMs}ms for session ${sessionId}`);
        send(ws, "session_ready", { sessionId });
        send(ws, "intro", { audio: introAudio });
        return;
      }

      // ── resume (reconnect within the 10-minute recovery window) ──────
      if (type === "resume") {
        const requestedId = data.sessionId;
        if (!requestedId) { send(ws, "error", { message: "No sessionId provided" }); return; }

        const found = await sessionGet(requestedId);
        if (!found || found.userId !== userId) {
          send(ws, "resume_failed", { reason: "Session expired or not found" });
          return;
        }

        sessionId = requestedId;
        session = found;
        await sessionSave(sessionId, session);
        console.log(`Session ${sessionId} resumed (${session.evaluations?.length ?? 0} answers completed)`);

        // Re-synthesize the current question's audio — the client shows no
        // transcript, so without audio the user would have no way to know
        // what they're being asked.
        const resumeAudio = session.currentQuestion
          ? await synthesize(session.currentQuestion.question, { sessionId })
          : null;

        send(ws, "resume_ok", {
          sessionId,
          questionsAnswered: session.evaluations?.length ?? 0,
          currentQuestion: session.currentQuestion,
          // Lets the client tell "never asked Q1 yet" apart from "mid-interview,
          // between an answered question and the next one" — those two need
          // different recovery messages (intro_done vs retry_advance).
          hasAskedAny: session.questions.length > 0,
          ...timeInfo(),
          audio: resumeAudio,
        });
        return;
      }

      // ── all subsequent handlers need an active session ────────────────
      if (!session) { send(ws, "error", { message: "Interview not started" }); return; }

      // ── interviewer intro finished playing — ask the first question ──
      // Routed through advance() (nextAction is still null here, which
      // falls through to sendQuestion) so a failure here is retryable via
      // "retry_advance" the same way a mid-interview failure is.
      if (type === "intro_done") {
        if (session.questions.length > 0) return; // already asked — ignore duplicate
        try {
          await advance();
        } catch (err) {
          console.error("Initial question generation failed:", err);
          send(ws, "error", { code: "advance_failed", message: "Had trouble starting the interview — tap retry." });
        }
        return;
      }

      // ── retry a stalled advance (question/follow-up/report generation
      //    failed after the answer was already scored) ───────────────────
      if (type === "retry_advance") {
        if (session.currentQuestion) return; // already have an active question — nothing to retry
        try {
          await advance();
        } catch (err) {
          console.error("Retry advance failed:", err);
          send(ws, "error", { code: "advance_failed", message: "Still couldn't continue the interview. Please try again in a moment." });
        }
        return;
      }

      // ── answer done (audio) ───────────────────────────────────────────
      if (type === "answer_done") {
        if (!session.currentQuestion) {
          send(ws, "error", { message: "No active question to answer." });
          return;
        }

        const audioBuffer = decodeAudio(data.audio);
        if (!audioBuffer) {
          send(ws, "error", { message: "No audio received. Please try again." });
          return;
        }

        send(ws, "status", { message: "Transcribing your answer..." });
        let transcript = "";
        try {
          transcript = (await transcribeAudio(audioBuffer, data.mimeType || "audio/webm", { sessionId })) ?? "";
        } catch (err) {
          console.warn("Answer transcription failed:", err.message);
        }

        if (!transcript.trim()) {
          send(ws, "error", { message: "Couldn't hear that clearly. Please try again." });
          return;
        }

        session.currentAnswer = transcript;

        const endEval = metrics.startTimer(sessionId, "llm_evaluation");
        await evaluateAnswer(session);
        endEval();

        // The answer is now scored and recorded. Clear currentQuestion
        // BEFORE attempting to advance so that if question/report
        // generation fails below, a client retry can only hit
        // "retry_advance" (which re-attempts advance()) — never
        // re-evaluate this same answer via a stray answer_done.
        session.currentQuestion = null;
        await sessionSave(sessionId, session);

        try {
          await advance();
        } catch (err) {
          console.error("Advance failed after answer evaluation:", err);
          send(ws, "error", { code: "advance_failed", message: "Had trouble continuing the interview — tap retry to pick back up." });
        }
        return;
      }

      if (type === "ping") { send(ws, "pong"); return; }

    } catch (err) {
      console.error("WS handler error:", err);
      send(ws, "error", { message: "Something went wrong on the server. Please try again." });
    } finally {
      busy = false;
    }
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    metrics.clearRequest(sessionId);
    // The session is intentionally left in the store — the recovery-window
    // TTL/sweep (not this handler) is responsible for evicting it later.
  });

  ws.on("error", (err) => console.error("WS error:", err.message));
}
