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

const sessions = new Map();

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

// Pre-generate next question + TTS during feedback reading window.
// Returns a Promise that resolves to { action, audio } or null on failure.
function startPreGen(session, action) {
  return (async () => {
    try {
      if (action === "followup") {
        await generateFollowUp(session);
        const audio = await synthesize(session.currentFollowUp.question);
        return { action, audio };
      } else {
        const q = await generateNextQuestion(session);
        const audio = await synthesize(q.question);
        return { action, audio };
      }
    } catch (err) {
      console.warn("Pre-gen failed:", err.message);
      return null;
    }
  })();
}

export function handleInterviewSocket(ws) {
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

        sessions.set(sessionId, {
          session,
          audioChunks: [],
          preNextPromise: null,   // Promise<{action, audio}|null>
        });

        send(ws, "session_ready", { sessionId });
        send(ws, "intro", { audio: introAudio });
        // Note: Q1 is NOT pre-generated here. It's generated AFTER the candidate
        // intro so it can reference what they said.
        return;
      }

      const entry = sessions.get(sessionId);
      if (!entry) { send(ws, "error", { message: "Session not found" }); return; }
      const { session } = entry;

      // ── audio chunk ──────────────────────────────────────────────────
      if (type === "audio_chunk") {
        entry.audioChunks.push(Buffer.from(data.chunk, "base64"));
        return;
      }

      // ── candidate intro (not scored) ─────────────────────────────────
      if (type === "candidate_intro") {
        let transcript = data.transcript ?? "";

        if (entry.audioChunks.length) {
          try {
            transcript = await transcribeAudio(Buffer.concat(entry.audioChunks));
          } catch (err) {
            console.warn("Whisper failed for intro:", err.message);
          }
          entry.audioChunks = [];
        }

        session.candidateIntro = transcript;
        console.log("Candidate intro received, generating Q1 with intro context...");

        // Generate Q1 NOW with the candidate's actual intro as context
        const q1 = await generateNextQuestion(session);
        const q1Audio = await synthesize(q1.question);

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

        if (entry.audioChunks.length) {
          try {
            transcript = await transcribeAudio(Buffer.concat(entry.audioChunks));
          } catch (err) {
            console.warn("Whisper failed, using Web Speech:", err.message);
          }
          entry.audioChunks = [];
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

        send(ws, "evaluation", { evaluation, remainingMin });

        // Start pre-generating while user reads feedback (runs in background)
        if (session.nextAction !== "done") {
          entry.preNextPromise = startPreGen(session, session.nextAction);
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
          sessions.delete(sessionId);
          return;
        }

        // Await pre-generated content (instant if done, waits if still running)
        const pre = entry.preNextPromise ? await entry.preNextPromise : null;
        entry.preNextPromise = null;

        if (session.nextAction === "followup") {
          if (pre?.action === "followup") {
            // Pre-gen ready — send immediately (zero TTS delay)
            send(ws, "followup", {
              question: session.currentFollowUp,
              index: session.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: session.duration,
              audio: pre.audio,
            });
          } else {
            // Pre-gen failed — generate now
            if (!session.currentFollowUp) await generateFollowUp(session);
            const audio = await synthesize(session.currentFollowUp.question);
            send(ws, "followup", {
              question: session.currentFollowUp,
              index: session.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: session.duration,
              audio,
            });
          }
        } else {
          if (pre?.action === "next") {
            // Pre-gen ready — send immediately
            send(ws, "question", {
              question: session.currentQuestion,
              index: session.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: session.duration,
              audio: pre.audio,
            });
          } else {
            // Pre-gen failed or still running — generate now
            if (pre === null && session.questions.length === session.evaluations.filter(e => !e.isFollowUp).length) {
              await generateNextQuestion(session);
            }
            const audio = await synthesize(session.currentQuestion.question);
            send(ws, "question", {
              question: session.currentQuestion,
              index: session.questions.length - 1,
              elapsed: Math.floor(elapsedMs / 60000),
              duration: session.duration,
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
    if (sessionId) sessions.delete(sessionId);
  });
  ws.on("error", (err) => console.error("WS error:", err.message));
}
