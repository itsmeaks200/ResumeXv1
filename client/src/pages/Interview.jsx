import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, MicOff, Loader2, WifiOff, RotateCcw, Volume2 } from "lucide-react";
import { createInterviewSocket, playAudio } from "../lib/interview-socket";

// ── Recovery bookkeeping ─────────────────────────────────────────────────
// Only ever attempt to resume a saved session if it belongs to the exact
// same interview attempt (same resume + JD + duration) currently being
// started. Otherwise a stale, abandoned session could silently hijack a
// brand-new interview the user just picked from the Dashboard.
const STORAGE_KEY = "interviewSession";

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function fingerprintFor(state) {
  return hashString(JSON.stringify({
    resume: state?.resume,
    jobDescription: state?.jobDescription ?? "",
    duration: state?.duration ?? 30,
  }));
}

const STAGES = {
  CONNECTING: "connecting",
  INTRO: "intro",         // interviewer's opening speech playing
  SPEAKING: "speaking",   // TTS question audio playing
  QUESTION: "question",   // ready for user input
  LISTENING: "listening", // recording the answer
  PROCESSING: "processing",
  ERROR: "error",
  RETRY: "retry",          // question/report generation failed after the answer was already scored — safe to retry
};

// ── Audio recorder hook — captures the raw answer as a blob for server-side
// Whisper transcription. No text ever touches the client. Purely
// button-driven — start/stop is controlled by the user, no auto-detection. ──
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function useRecorder() {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef("audio/webm");

  const start = useCallback((stream) => {
    if (typeof MediaRecorder === "undefined") return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    mimeTypeRef.current = mimeType || "audio/webm";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start();
    recorderRef.current = recorder;
  }, []);

  const stopAndGetAudio = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") { resolve(null); return; }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        chunksRef.current = [];
        if (blob.size === 0) { resolve(null); return; }
        resolve({ base64: await blobToBase64(blob), mimeType: mimeTypeRef.current });
      };
      recorder.stop();
    });
  }, []);

  return { start, stopAndGetAudio };
}

// ── Interviewer avatar ───────────────────────────────────────────────────
function InterviewerAvatar({ stage }) {
  const isSpeaking = stage === STAGES.SPEAKING || stage === STAGES.INTRO;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-28 h-28 flex items-center justify-center">
        {isSpeaking && (
          <>
            <div className="absolute inset-0 rounded-full pulse-ring" style={{ border: "2px solid rgba(15,118,110,0.25)" }} />
            <div className="absolute inset-0 rounded-full pulse-ring" style={{ border: "2px solid rgba(6,182,212,0.2)", animationDelay: "0.6s" }} />
          </>
        )}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-sm font-bold text-white relative z-10 select-none transition-all duration-500"
          style={{
            background: "var(--ink)",
            boxShadow: isSpeaking
              ? "0 0 0 6px var(--accent-glow)"
              : "0 1px 2px rgba(22,21,15,0.12)",
          }}
        >
          Alex
        </div>
      </div>

      <div className="flex items-end gap-1 h-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-1.5 rounded-full"
            style={{
              background: "var(--accent-start)",
              animation: isSpeaking ? `bounce-bar 0.${4 + (i % 4)}s ease-in-out ${i * 0.09}s infinite` : "none",
              height: isSpeaking ? `${10 + (i % 3) * 8}px` : "5px",
              opacity: isSpeaking ? 1 : 0.25,
              transition: "height 0.3s",
            }}
          />
        ))}
      </div>

      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {isSpeaking ? "Alex is speaking" : "Alex — AI Interviewer"}
      </span>
    </div>
  );
}

// ── Candidate avatar ─────────────────────────────────────────────────────
function CandidateAvatar({ isListening }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-28 h-28 flex items-center justify-center">
        {isListening && (
          <div className="absolute w-32 h-32 rounded-full pulse-ring" style={{ border: "2px solid rgba(239,68,68,0.3)" }} />
        )}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-sm font-bold text-white relative z-10 transition-all duration-200"
          style={{
            background: "var(--ink)",
            boxShadow: isListening ? "0 0 0 6px var(--danger-glow)" : "0 1px 2px rgba(22,21,15,0.12)",
          }}
        >
          You
        </div>
      </div>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {isListening ? "Recording..." : "Waiting"}
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────
export default function Interview() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [stage, setStage] = useState(STAGES.CONNECTING);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNum, setQuestionNum] = useState(0);
  const [duration, setDuration] = useState(state?.duration ?? 30); // minutes
  const [remainingSec, setRemainingSec] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);

  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Local 1s countdown for display — the server enforces the actual cutoff;
  // this just keeps the strict time constraint visible between questions.
  useEffect(() => {
    if (remainingSec === null) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemainingSec((s) => (s === null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec === null]);

  const { start: startRecorder, stopAndGetAudio } = useRecorder();

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startRecorder(stream);
    } catch {
      setError("Microphone access is required to answer. Please allow microphone access and refresh.");
      setStage(STAGES.ERROR);
    }
  }, [startRecorder]);

  const finishAnswer = useCallback(async () => {
    setStage(STAGES.PROCESSING);
    const audioData = await stopAndGetAudio();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (!audioData) {
      setError("No audio captured — please try again.");
      setStage(STAGES.QUESTION);
      return;
    }
    socketRef.current?.send("answer_done", { audio: audioData.base64, mimeType: audioData.mimeType });
  }, [stopAndGetAudio]);

  const startListening = async () => {
    setError("");
    setStage(STAGES.LISTENING);
    await startMic();
  };

  const retryAdvance = () => {
    setError("");
    setStatusMessage("Retrying...");
    setStage(STAGES.PROCESSING);
    socketRef.current?.send("retry_advance");
  };

  // ── WS setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state?.resume) { navigate("/dashboard"); return; }

    const fingerprint = fingerprintFor(state);
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { saved = null; }
    const canResume = saved?.sessionId && saved.fingerprint === fingerprint;

    const startFresh = (socket) => {
      sessionStorage.removeItem(STORAGE_KEY);
      socket.send("start", {
        resume: state.resume,
        jobDescription: state.jobDescription ?? "",
        duration: state.duration ?? 30,
      });
    };

    const socket = createInterviewSocket({
      onOpen: () => {
        setWsConnected(true);
        if (canResume) {
          socket.send("resume", { sessionId: saved.sessionId });
        } else {
          startFresh(socket);
        }
      },
      onClose: () => setWsConnected(false),
      onError: () => {
        setError("Connection lost. Refresh within 10 minutes to resume where you left off.");
        setStage(STAGES.ERROR);
      },
      onMessage: async (msg) => {
        if (msg.type === "session_ready") {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: msg.sessionId, fingerprint }));
          return;
        }

        if (msg.type === "resume_ok") {
          if (msg.duration) setDuration(msg.duration);
          if (typeof msg.remainingSec === "number") setRemainingSec(msg.remainingSec);
          if (msg.currentQuestion) {
            setCurrentQuestion(msg.currentQuestion);
            setQuestionNum(msg.questionsAnswered + 1);
            if (msg.audio) {
              setStage(STAGES.SPEAKING);
              const audio = playAudio(msg.audio);
              if (audio) {
                audio.onended = () => setStage(STAGES.QUESTION);
                audio.onerror = () => setStage(STAGES.QUESTION);
              } else {
                setStage(STAGES.QUESTION);
              }
            } else {
              setStage(STAGES.QUESTION);
            }
          } else if (msg.hasAskedAny) {
            // Reconnected mid-interview, between an answered question and the
            // next one (e.g. dropped while the next question was generating).
            // intro_done would be a no-op here — this is the retry path.
            setStatusMessage("Reconnecting...");
            setStage(STAGES.PROCESSING);
            socket.send("retry_advance");
          } else {
            // Reconnected before the first question was ever sent — ask for it again.
            socket.send("intro_done");
          }
          return;
        }

        if (msg.type === "resume_failed") {
          startFresh(socket);
          return;
        }

        if (msg.type === "intro") {
          setStage(STAGES.INTRO);
          const proceed = () => socketRef.current?.send("intro_done");
          const audio = msg.audio ? playAudio(msg.audio) : null;
          if (audio) {
            audio.onended = proceed;
            audio.onerror = proceed;
          } else {
            proceed();
          }
          return;
        }

        if (msg.type === "question") {
          setCurrentQuestion(msg.question);
          setQuestionNum(msg.index + 1);
          if (msg.duration) setDuration(msg.duration);
          if (typeof msg.remainingSec === "number") setRemainingSec(msg.remainingSec);
          setStatusMessage("");

          if (msg.audio) {
            setStage(STAGES.SPEAKING);
            const audio = playAudio(msg.audio);
            if (audio) {
              audio.onended = () => setStage(STAGES.QUESTION);
              audio.onerror = () => setStage(STAGES.QUESTION);
            } else {
              setStage(STAGES.QUESTION);
            }
          } else {
            setStage(STAGES.QUESTION);
          }
          return;
        }

        if (msg.type === "status") {
          setStatusMessage(msg.message ?? "");
          return;
        }

        if (msg.type === "report") {
          sessionStorage.removeItem(STORAGE_KEY);
          navigate("/report", { state: { report: msg.report, interviewId: msg.interviewId } });
          return;
        }

        if (msg.type === "error") {
          setError(msg.message);
          if (msg.code === "advance_failed") {
            // The answer was already scored server-side — safe to retry
            // continuing without resubmitting audio.
            setStage(STAGES.RETRY);
          } else {
            setStage((s) => (s === STAGES.PROCESSING ? STAGES.QUESTION : s));
          }
        }
      },
    });

    socketRef.current = socket;
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Connecting / error screens ──────────────────────────────────────────
  if (stage === STAGES.CONNECTING) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={26} className="animate-spin" style={{ color: "var(--accent-mid)" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Setting up your interview room...</p>
      </div>
    );
  }

  if (stage === STAGES.ERROR) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <WifiOff size={22} style={{ color: "var(--danger)" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{error}</p>
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 gradient-btn text-sm px-4 py-2">
          <RotateCcw size={14} /> Back to Dashboard
        </button>
      </div>
    );
  }

  if (stage === STAGES.RETRY) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <WifiOff size={22} style={{ color: "var(--danger)" }} />
        <p className="text-sm text-center max-w-sm" style={{ color: "var(--text-secondary)" }}>{error}</p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Your last answer was already saved — this just picks the interview back up.</p>
        <div className="flex gap-3">
          <button onClick={retryAdvance} className="flex items-center gap-2 gradient-btn text-sm px-4 py-2">
            <RotateCcw size={14} /> Retry
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isSpeaking = stage === STAGES.SPEAKING || stage === STAGES.INTRO;
  const isListening = stage === STAGES.LISTENING;
  const isProcessing = stage === STAGES.PROCESSING;
  const canSpeak = stage === STAGES.QUESTION;
  const totalSec = duration * 60;
  const elapsedSec = remainingSec === null ? 0 : Math.max(0, totalSec - remainingSec);
  const pct = totalSec ? Math.min(100, (elapsedSec / totalSec) * 100) : 0;
  const isLowTime = remainingSec !== null && remainingSec <= 120;
  const mmss = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="-mx-6 -my-16 flex flex-col" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── Connection status ────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 py-3">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: wsConnected ? "var(--success)" : "var(--danger)",
            boxShadow: wsConnected ? "0 0 6px rgba(34,197,94,0.5)" : "0 0 6px rgba(239,68,68,0.5)",
          }}
        />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{wsConnected ? "Live" : "Disconnected"}</span>
      </div>

      {/* ── Two-side call view ───────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center gap-20">
        <InterviewerAvatar stage={stage} />
        <div className="w-px self-stretch my-16" style={{ background: "var(--border-subtle)" }} />
        <CandidateAvatar isListening={isListening} />
      </div>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      {questionNum > 0 && (
        <div className="flex flex-col items-center gap-2 pb-4">
          <span className="text-xs flex items-center gap-2" style={{ color: isLowTime ? "var(--danger)" : "var(--text-muted)" }}>
            Question {questionNum}
            {remainingSec !== null && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                {mmss(remainingSec)} left
              </>
            )}
          </span>
          <div className="w-64 h-1 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: isLowTime ? "var(--danger)" : "var(--accent-start)",
              }}
            />
          </div>
          {currentQuestion && (
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: "var(--accent-glow)", color: "var(--accent-mid)" }}>
                {currentQuestion.topic}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ color: currentQuestion.difficulty === "Hard" ? "var(--danger)" : currentQuestion.difficulty === "Medium" ? "var(--warning)" : "var(--success)" }}>
                {currentQuestion.difficulty}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 pb-10" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "1.5rem" }}>
        <div className="min-h-5 text-center">
          {isSpeaking && (
            <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <Volume2 size={12} /> Alex is speaking...
            </span>
          )}
          {canSpeak && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Tap the mic to start answering, tap again when you're done
            </span>
          )}
          {isProcessing && (
            <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={12} className="animate-spin" /> {statusMessage || "Processing..."}
            </span>
          )}
          {error && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
        </div>

        {(canSpeak || isListening) && (
          <div className="relative flex items-center justify-center">
            {isListening && (
              <div className="absolute w-14 h-14 rounded-full pulse-ring" style={{ border: "2px solid rgba(239,68,68,0.35)" }} />
            )}
            <button
              onClick={isListening ? finishAnswer : startListening}
              className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background: isListening ? "var(--danger)" : "var(--ink)",
                boxShadow: isListening ? "0 4px 12px rgba(179,38,30,0.25)" : "0 1px 2px rgba(22,21,15,0.16)",
              }}
            >
              {isListening ? <MicOff size={18} className="text-white" /> : <Mic size={18} className="text-white" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
