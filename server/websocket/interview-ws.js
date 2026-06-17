import {
  createSession,
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

async function sendQuestion(ws, session) {
  const q = session.currentFollowUp ?? session.currentQuestion;
  const isFollowUp = session.currentFollowUp !== null;
  const audio = await synthesize(q.question);
  send(ws, isFollowUp ? "followup" : "question", {
    question: q,
    index: session.questions.length - 1,   // 0-based index of current main question
    total: session.questionCount,
    audio,
  });
}

export function handleInterviewSocket(ws) {
  let sessionId = null;

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { type, ...data } = msg;

    // ── start ──────────────────────────────────────────────────────
    if (type === "start") {
      sessionId = crypto.randomUUID();
      const session = createSession(
        data.resume,
        data.jobDescription,
        data.duration ?? 30,
        data.questionCount ?? 5
      );

      // Enrich resume projects with GitHub data (token optional, public repos work without)
      const githubUrls = (data.resume?.projects ?? [])
        .map((p) => p.github_url)
        .filter(Boolean);

      if (githubUrls.length > 0) {
        try {
          session.githubProjects = await analyzeGithubRepos(githubUrls);
          console.log(`Enriched ${session.githubProjects.length}/${githubUrls.length} GitHub projects`);
        } catch (err) {
          console.warn("GitHub enrichment failed, continuing without:", err.message);
        }
      }

      sessions.set(sessionId, { session, audioChunks: [] });
      send(ws, "session_ready", { sessionId });

      // Generate first question dynamically (warmup)
      await generateNextQuestion(session);
      await sendQuestion(ws, session);
      return;
    }

    const entry = sessions.get(sessionId);
    if (!entry) { send(ws, "error", { message: "Session not found" }); return; }
    const { session } = entry;

    // ── audio chunk ────────────────────────────────────────────────
    if (type === "audio_chunk") {
      entry.audioChunks.push(Buffer.from(data.chunk, "base64"));
      return;
    }

    // ── answer done ────────────────────────────────────────────────
    if (type === "answer_done") {
      let transcript = data.transcript ?? "";

      if (entry.audioChunks.length) {
        try {
          const audioBuffer = Buffer.concat(entry.audioChunks);
          transcript = await transcribeAudio(audioBuffer);
        } catch (err) {
          console.warn("Whisper failed, using Web Speech transcript:", err.message);
        }
        entry.audioChunks = [];
      }

      if (!transcript.trim()) {
        send(ws, "error", { message: "No transcript received. Please try again." });
        return;
      }

      send(ws, "transcript_confirmed", { transcript });
      session.currentAnswer = transcript;

      const { evaluation } = await evaluateAnswer(session);
      send(ws, "evaluation", { evaluation });
      // Client controls pacing — wait for "next"
      return;
    }

    // ── next ───────────────────────────────────────────────────────
    if (type === "next") {
      if (session.nextAction === "followup") {
        await generateFollowUp(session);
        await sendQuestion(ws, session);

      } else if (session.nextAction === "done") {
        await generateReport(session);
        send(ws, "report", { report: session.report });
        sessions.delete(sessionId);

      } else {
        // Generate next question dynamically with full conversation context
        await generateNextQuestion(session);
        await sendQuestion(ws, session);
      }
      return;
    }

    if (type === "ping") { send(ws, "pong"); return; }
  });

  ws.on("close", () => { if (sessionId) sessions.delete(sessionId); });
  ws.on("error", (err) => console.error("WS error:", err.message));
}
