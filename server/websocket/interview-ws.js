import {
  createSession,
  generateQuestions,
  evaluateAnswer,
  generateFollowUp,
  advanceQuestion,
  generateReport,
} from "../services/interview-graph.js";
import { synthesize } from "../services/tts.js";
import { transcribeAudio } from "../services/groq.js";

const sessions = new Map();

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

async function sendQuestion(ws, session) {
  const q = session.currentFollowUp ?? session.questions[session.currentIndex];
  const audio = await synthesize(q.question);
  const isFollowUp = session.currentFollowUp !== null;
  send(ws, isFollowUp ? "followup" : "question", {
    question: q,
    index: session.currentIndex,
    total: session.questions.length,
    audio,
  });
}

export function handleInterviewSocket(ws) {
  let sessionId = null;

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { type, ...data } = msg;

    // ── start ──────────────────────────────────────────────────────────────
    if (type === "start") {
      sessionId = crypto.randomUUID();
      const session = createSession(data.resume, data.jobDescription, data.duration ?? 30);
      await generateQuestions(session, data.questionCount ?? 5);
      sessions.set(sessionId, { session, audioChunks: [] });
      send(ws, "session_ready", { sessionId });
      await sendQuestion(ws, session);
      return;
    }

    const entry = sessions.get(sessionId);
    if (!entry) { send(ws, "error", { message: "Session not found" }); return; }
    const { session } = entry;

    // ── audio chunk ────────────────────────────────────────────────────────
    if (type === "audio_chunk") {
      entry.audioChunks.push(Buffer.from(data.chunk, "base64"));
      return;
    }

    // ── answer done ────────────────────────────────────────────────────────
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
      // Wait for "next" from client — client controls pacing after feedback
      return;
    }

    // ── next ────────────────────────────────────────────────────────────
    if (type === "next") {
      if (session.nextAction === "followup") {
        await generateFollowUp(session);
        await sendQuestion(ws, session);
      } else if (session.nextAction === "done") {
        await generateReport(session);
        send(ws, "report", { report: session.report });
        sessions.delete(sessionId);
      } else {
        advanceQuestion(session);
        await sendQuestion(ws, session);
      }
      return;
    }

    if (type === "ping") { send(ws, "pong"); return; }
  });

  ws.on("close", () => { if (sessionId) sessions.delete(sessionId); });
  ws.on("error", (err) => console.error("WS error:", err.message));
}
