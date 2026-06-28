import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, MicOff, Send, Loader2, WifiOff, RotateCcw, Volume2, Clock } from "lucide-react";
import { createInterviewSocket, playAudio } from "../lib/interview-socket";

const STAGES = {
  CONNECTING: "connecting",
  INTRO: "intro",                    // interviewer's opening speech playing
  CANDIDATE_INTRO: "candidate_intro", // user gives self-intro (VAD active, not scored)
  SPEAKING: "speaking",              // TTS question audio playing
  QUESTION: "question",              // ready for user input
  LISTENING: "listening",            // VAD active + recording
  PROCESSING: "processing",
  ERROR: "error",
};

const SILENCE_MS = 2000;      // ms of silence to trigger auto-submit
const SPEECH_THRESHOLD = 12;  // amplitude threshold (0-128 range)
const MIN_AUDIO_THRESHOLD = 3; // minimum audio level threshold (0-128 range) — below this is background noise only
const LOW_AUDIO_TIMEOUT = 8000; // ms of audio below minimum before disconnect (8 seconds)

// ── VAD hook ────────────────────────────────────────────────────────────
function useVAD(onAutoSubmit, onLowAudio) {
  const analyserRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);
  const speechRef = useRef(false);
  const lastSpeechRef = useRef(0);
  const activeRef = useRef(false);
  const lowAudioStartRef = useRef(0); // track when audio dropped below minimum
  const [volume, setVolume] = useState(0);
  const [countdown, setCountdown] = useState(null); // seconds remaining before auto-submit

  const start = useCallback(async (stream) => {
    activeRef.current = true;
    speechRef.current = false;
    lastSpeechRef.current = 0;
    lowAudioStartRef.current = 0;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    ctxRef.current = ctx;
    analyserRef.current = analyser;

    function tick() {
      if (!activeRef.current) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(Math.min(100, (avg / 64) * 100));

      // Check if audio is below minimum threshold (likely just background noise)
      if (avg < MIN_AUDIO_THRESHOLD) {
        if (lowAudioStartRef.current === 0) {
          lowAudioStartRef.current = Date.now();
        } else if (Date.now() - lowAudioStartRef.current > LOW_AUDIO_TIMEOUT) {
          activeRef.current = false;
          setVolume(0);
          setCountdown(null);
          onLowAudio();
          return;
        }
      } else {
        lowAudioStartRef.current = 0; // reset when audio is adequate
      }

      if (avg > SPEECH_THRESHOLD) {
        speechRef.current = true;
        lastSpeechRef.current = Date.now();
        setCountdown(null);
      } else if (speechRef.current) {
        const silent = Date.now() - lastSpeechRef.current;
        if (silent > SILENCE_MS) {
          activeRef.current = false;
          setVolume(0);
          setCountdown(null);
          onAutoSubmit();
          return;
        }
        const remaining = Math.ceil((SILENCE_MS - silent) / 1000);
        setCountdown(remaining);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [onAutoSubmit, onLowAudio]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    setVolume(0);
    setCountdown(null);
    speechRef.current = false;
    lowAudioStartRef.current = 0;
  }, []);

  return { start, stop, volume, countdown };
}

// ── Speech recognition hook ─────────────────────────────────────────────
function useSpeechRecognition(onInterim, onFinal) {
  const recRef = useRef(null);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (interim) onInterim(interim);
      if (final) onFinal(final);
    };
    rec.onerror = (e) => console.warn("SR error:", e.error);
    rec.start();
    recRef.current = rec;
  }, [onInterim, onFinal]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  return { start, stop };
}

// ── Interviewer avatar ───────────────────────────────────────────────────
function InterviewerAvatar({ stage }) {
  const isSpeaking = stage === STAGES.SPEAKING || stage === STAGES.INTRO;
  const isListening = stage === STAGES.LISTENING || stage === STAGES.CANDIDATE_INTRO;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-28 h-28 flex items-center justify-center">
        {isSpeaking && (
          <>
            <div className="absolute inset-0 rounded-full pulse-ring" style={{ border: "2px solid rgba(139,92,246,0.3)" }} />
            <div className="absolute inset-0 rounded-full pulse-ring" style={{ border: "2px solid rgba(6,182,212,0.2)", animationDelay: "0.6s" }} />
          </>
        )}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-sm font-bold text-white relative z-10 select-none transition-all duration-500"
          style={{
            background: "linear-gradient(135deg, var(--accent-start), var(--accent-end))",
            boxShadow: isSpeaking
              ? "0 0 40px rgba(139,92,246,0.5), 0 0 80px rgba(139,92,246,0.15)"
              : "0 0 20px var(--accent-glow)",
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
              background: isListening
                ? "linear-gradient(to top, var(--success), #06b6d4)"
                : "linear-gradient(to top, var(--accent-start), var(--accent-end))",
              animation: (isSpeaking || isListening) ? `bounce-bar 0.${4 + (i % 4)}s ease-in-out ${i * 0.09}s infinite` : "none",
              height: (isSpeaking || isListening) ? `${10 + (i % 3) * 8}px` : "5px",
              opacity: (isSpeaking || isListening) ? 1 : 0.25,
              transition: "height 0.3s",
            }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: isSpeaking ? "var(--accent-mid)" : isListening ? "var(--success)" : "var(--text-muted)",
            boxShadow: isSpeaking ? "0 0 8px rgba(167,139,250,0.7)" : isListening ? "0 0 8px rgba(34,197,94,0.7)" : "none",
            animation: (isSpeaking || isListening) ? "pulse-glow 1.5s ease-in-out infinite" : "none",
          }}
        />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {isSpeaking ? "Alex is speaking" : isListening ? "You are speaking" : "Alex — AI Interviewer"}
        </span>
      </div>
    </div>
  );
}

// ── VAD volume bar ───────────────────────────────────────────────────────
function VolumeBar({ volume, countdown }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{
            width: `${Math.min(100, volume)}%`,
            background: volume > 60
              ? "linear-gradient(90deg, var(--success), #06b6d4)"
              : volume > 20
                ? "linear-gradient(90deg, var(--accent-start), var(--accent-end))"
                : "linear-gradient(90deg, var(--text-muted), var(--border-subtle))",
          }}
        />
      </div>
      {countdown !== null && (
        <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: "var(--text-muted)", minWidth: "60px" }}>
          sending in {countdown}s...
        </span>
      )}
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  if (msg.role === "system") {
    return (
      <div className="flex justify-center fade-in">
        <span
          className="text-xs px-3 py-1.5 rounded-full"
          style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
        >
          {msg.content}
        </span>
      </div>
    );
  }

  if (msg.role === "interviewer") {
    return (
      <div className="flex gap-3 items-start fade-in">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, var(--accent-start), var(--accent-end))" }}
        >
          Alex
        </div>
        <div className="max-w-[82%] space-y-1.5">
          {(msg.meta?.topic || msg.meta?.type) && (
            <div className="flex items-center gap-2 flex-wrap">
              {msg.isFollowUp && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: "rgba(6,182,212,0.15)", color: "var(--accent-end)" }}>
                  ↩ Probe
                </span>
              )}
              {msg.meta?.topic && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: "var(--accent-glow)", color: "var(--accent-mid)" }}>
                  {msg.meta.topic}
                </span>
              )}
              {msg.meta?.type && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{msg.meta.type}</span>}
              {msg.meta?.difficulty && (
                <span className="text-xs font-semibold" style={{ color: msg.meta.difficulty === "Hard" ? "var(--danger)" : msg.meta.difficulty === "Medium" ? "var(--warning)" : "var(--success)" }}>
                  {msg.meta.difficulty}
                </span>
              )}
            </div>
          )}
          <div
            className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          >
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex gap-3 items-start justify-end fade-in">
        <div className="max-w-[82%]">
          <div
            className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(6,182,212,0.12))",
              border: "1px solid rgba(139,92,246,0.25)",
              color: "var(--text-primary)",
            }}
          >
            {msg.content}
          </div>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
        >
          You
        </div>
      </div>
    );
  }

  return null;
}

// ── Main component ───────────────────────────────────────────────────────
export default function Interview() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [stage, setStage] = useState(STAGES.CONNECTING);
  const [messages, setMessages] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNum, setQuestionNum] = useState(0);
  const [elapsedMin, setElapsedMin] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [isIntroPhase, setIsIntroPhase] = useState(false);

  const socketRef = useRef(null);
  const accumulatedRef = useRef("");
  const mediaRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);
  const stageRef = useRef(stage);
  const timerRef = useRef(null);
  const interviewStartRef = useRef(null);
  stageRef.current = stage;

  const addMessage = useCallback((msg) => setMessages((p) => [...p, msg]), []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcript, interimText]);

  // ── Auto-submit callback for VAD ──────────────────────────────────────
  const autoSubmit = useCallback(() => {
    const s = stageRef.current;
    if (s === STAGES.LISTENING) {
      submitAnswerInternal();
    } else if (s === STAGES.CANDIDATE_INTRO) {
      submitIntroInternal();
    }
  }, []);

  // ── Low audio detection callback ───────────────────────────────────────
  const lowAudioDetected = useCallback(() => {
    setError("Microphone audio too low — only background noise detected. Please speak louder or check your microphone.");
    setStage(STAGES.ERROR);
  }, []);

  const { start: startVAD, stop: stopVAD, volume, countdown } = useVAD(autoSubmit, lowAudioDetected);

  const onInterim = useCallback((t) => setInterimText(t), []);
  const onFinal = useCallback((t) => {
    accumulatedRef.current += " " + t;
    setTranscript(accumulatedRef.current.trim());
    setInterimText("");
  }, []);
  const { start: startSR, stop: stopSR } = useSpeechRecognition(onInterim, onFinal);

  // ── Start mic (shared between intro + answer phases) ──────────────────
  const startMic = useCallback(async () => {
    accumulatedRef.current = "";
    setTranscript("");
    setInterimText("");
    audioChunksRef.current = [];

    startSR();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startVAD(stream);

      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.start(3000);
      mediaRef.current = mr;
    } catch {
      /* mic denied — SpeechRecognition only */
    }
  }, [startSR, startVAD]);

  const stopMic = useCallback(() => {
    stopSR();
    stopVAD();
    setInterimText("");

    return new Promise((resolve) => {
      if (mediaRef.current?.state === "recording") {
        mediaRef.current.onstop = async () => {
          for (const chunk of audioChunksRef.current) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result.split(",")[1];
              socketRef.current?.sendAudioChunk(base64);
            };
            reader.readAsDataURL(chunk);
          }
          streamRef.current?.getTracks().forEach((t) => t.stop());
          resolve();
        };
        mediaRef.current.stop();
      } else {
        resolve();
      }
    });
  }, [stopSR, stopVAD]);

  // ── Submit answer ─────────────────────────────────────────────────────
  function submitAnswerInternal() {
    const final = accumulatedRef.current.trim();
    if (!final || final.length < 3) {
      setError("Answer too short — please say more.");
      setStage(STAGES.QUESTION);
      return;
    }
    setError("");
    addMessage({ role: "user", content: final });
    setTranscript("");
    setStage(STAGES.PROCESSING);
    stopMic().then(() => {
      socketRef.current?.send("answer_done", { transcript: final });
    });
  }

  function submitIntroInternal() {
    const final = accumulatedRef.current.trim();
    setError("");
    if (final) addMessage({ role: "user", content: final });
    setTranscript("");
    setStage(STAGES.PROCESSING);
    setIsIntroPhase(false);
    stopMic().then(() => {
      socketRef.current?.send("candidate_intro", { transcript: final });
    });
  }

  const submitAnswer = () => {
    stopVAD();
    submitAnswerInternal();
  };

  // ── WS setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state?.resume) { navigate("/dashboard"); return; }

    const socket = createInterviewSocket({
      onOpen: () => {
        setWsConnected(true);
        socket.send("start", {
          resume: state.resume,
          jobDescription: state.jobDescription ?? "",
          questionCount: state.questionCount ?? 5,
          duration: state.duration ?? 30,
        });
      },
      onClose: () => setWsConnected(false),
      onError: () => {
        setError("Connection lost. Please refresh and try again.");
        setStage(STAGES.ERROR);
      },
      onMessage: async (msg) => {
        // ── Interviewer intro ──────────────────────────────────────────
        if (msg.type === "intro") {
          setStage(STAGES.INTRO);
          addMessage({ role: "system", content: "Interview starting — Alex is speaking" });

          if (msg.audio) {
            const audio = playAudio(msg.audio);
            if (audio) {
              audio.onended = async () => {
                // Auto-open mic for candidate intro after interviewer finishes
                setIsIntroPhase(true);
                addMessage({ role: "interviewer", content: "Tell me about yourself — what have you been building lately?", meta: {} });
                setStage(STAGES.CANDIDATE_INTRO);
                await startMic();
              };
              audio.onerror = async () => {
                setIsIntroPhase(true);
                setStage(STAGES.CANDIDATE_INTRO);
                await startMic();
              };
            } else {
              setIsIntroPhase(true);
              setStage(STAGES.CANDIDATE_INTRO);
              await startMic();
            }
          }
        }

        // ── Question / follow-up ───────────────────────────────────────
        if (msg.type === "question" || msg.type === "followup") {
          const isFollowUp = msg.type === "followup";
          setCurrentQuestion(msg.question);
          setQuestionNum(msg.index + 1);
          if (msg.elapsed !== undefined) setElapsedMin(msg.elapsed);

          // Start client-side elapsed timer on Q1
          if (msg.index === 0 && !interviewStartRef.current) {
            interviewStartRef.current = Date.now();
            timerRef.current = setInterval(() => {
              const mins = Math.floor((Date.now() - interviewStartRef.current) / 60000);
              setElapsedMin(mins);
            }, 30000);
          }

          setTranscript("");
          setInterimText("");
          accumulatedRef.current = "";

          addMessage({
            role: "interviewer",
            content: msg.question.question,
            meta: { type: msg.question.type, topic: msg.question.topic, difficulty: msg.question.difficulty },
            isFollowUp,
          });

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
        }

        if (msg.type === "evaluation") {
          // Per-question feedback is intentionally not shown — full scoring
          // and feedback only surfaces in the final report. Move straight on.
          socketRef.current?.send("next");
        }

        if (msg.type === "transcript_confirmed") {
          setTranscript(msg.transcript);
        }

        if (msg.type === "report") {
          navigate("/report", { state: { report: msg.report } });
        }

        if (msg.type === "error") {
          setError(msg.message);
        }
      },
    });

    socketRef.current = socket;
    return () => {
      stopMic();
      socket.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startListening = async () => {
    setError("");
    setStage(STAGES.LISTENING);
    await startMic();
  };

  const stopListening = () => {
    stopVAD();
    stopSR();
    setInterimText("");
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.onstop = () => {};
      mediaRef.current.stop();
    }
    setStage(STAGES.QUESTION);
  };

  // ── Connecting screen ──────────────────────────────────────────────────
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

  const isSpeaking = stage === STAGES.SPEAKING || stage === STAGES.INTRO;
  const isListening = stage === STAGES.LISTENING;
  const isCandidateIntro = stage === STAGES.CANDIDATE_INTRO;
  const isProcessing = stage === STAGES.PROCESSING;
  const canSpeak = stage === STAGES.QUESTION;
  const duration = state?.duration ?? 30;
  const pct = Math.min(100, (elapsedMin / duration) * 100);

  return (
    <div className="-mx-6 -my-16 flex" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── Left panel ───────────────────────────────────────────────── */}
      <div
        className="w-72 shrink-0 flex flex-col items-center justify-between py-8 px-5"
        style={{ borderRight: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-col items-center gap-6 w-full">
          <InterviewerAvatar stage={stage} />

          {questionNum > 0 && (
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                <span>Question {questionNum}</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} /> {elapsedMin}/{duration} min
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, var(--accent-start), var(--accent-end))",
                    boxShadow: "0 0 8px var(--accent-glow)",
                  }}
                />
              </div>
            </div>
          )}

          {isCandidateIntro && (
            <div
              className="w-full px-4 py-3 rounded-xl text-xs leading-relaxed"
              style={{ background: "var(--accent-glow)", border: "1px solid rgba(139,92,246,0.2)", color: "var(--accent-mid)" }}
            >
              Introduce yourself — take your time. I'll listen until you're done.
            </div>
          )}
        </div>

        {currentQuestion && !isIntroPhase && (
          <div className="w-full flex-1 mt-6 overflow-y-auto space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: "var(--accent-glow)", color: "var(--accent-mid)" }}>
                {currentQuestion.topic}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ color: currentQuestion.difficulty === "Hard" ? "var(--danger)" : currentQuestion.difficulty === "Medium" ? "var(--warning)" : "var(--success)" }}>
                {currentQuestion.difficulty}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {currentQuestion.question}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: wsConnected ? "var(--success)" : "var(--danger)",
              boxShadow: wsConnected ? "0 0 6px rgba(34,197,94,0.5)" : "0 0 6px rgba(239,68,68,0.5)",
            }}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{wsConnected ? "Live" : "Disconnected"}</span>
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Scrollable chat */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Connecting to Alex...</p>
            </div>
          )}

          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

          {/* Live transcript preview */}
          {(isListening || isCandidateIntro) && (transcript || interimText) && (
            <div className="flex gap-3 items-start justify-end fade-in">
              <div className="max-w-[82%]">
                <div
                  className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
                  style={{ background: "rgba(139,92,246,0.08)", border: "1px dashed rgba(139,92,246,0.3)", color: "var(--text-primary)" }}
                >
                  <span>{transcript}</span>
                  {interimText && <span style={{ color: "var(--text-muted)" }}> {interimText}</span>}
                </div>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
              >
                You
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Controls bar ─────────────────────────────────────────── */}
        <div className="px-6 py-4 space-y-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>

          {/* VAD volume bar (shown while listening) */}
          {(isListening || isCandidateIntro) && (
            <VolumeBar volume={volume} countdown={countdown} />
          )}

          <div className="flex items-center gap-4">
            {/* Status text */}
            <div className="flex-1 min-w-0">
              {isSpeaking && (
                <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Volume2 size={12} /> Alex is speaking...
                </span>
              )}
              {canSpeak && !transcript && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Click the mic to answer — or it'll auto-stop when you're done
                </span>
              )}
              {canSpeak && transcript && (
                <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>"{transcript}"</p>
              )}
              {isCandidateIntro && !transcript && !interimText && (
                <span className="flex items-center gap-2 text-xs" style={{ color: "var(--success)" }}>
                  <div className="flex items-end gap-0.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="w-1 rounded-full" style={{ height: "10px", background: "var(--success)", animation: `bounce-bar 0.5s ease-in-out ${i * 0.1}s infinite` }} />
                    ))}
                  </div>
                  Listening for your introduction...
                </span>
              )}
              {isProcessing && (
                <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Loader2 size={12} className="animate-spin" /> Evaluating your answer...
                </span>
              )}
              {error && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
            </div>

            {/* Mic button — only for scored answers, not candidate intro (that's auto) */}
            {(canSpeak || isListening) && (
              <div className="relative flex items-center justify-center">
                {isListening && (
                  <div className="absolute w-12 h-12 rounded-full pulse-ring" style={{ border: "2px solid rgba(239,68,68,0.35)" }} />
                )}
                <button
                  onClick={isListening ? stopListening : startListening}
                  className="relative z-10 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    background: isListening
                      ? "linear-gradient(135deg, var(--danger), #ec4899)"
                      : "linear-gradient(135deg, var(--accent-start), var(--accent-end))",
                    boxShadow: isListening ? "0 0 20px rgba(239,68,68,0.4)" : "0 0 15px var(--accent-glow)",
                  }}
                >
                  {isListening ? <MicOff size={16} className="text-white" /> : <Mic size={16} className="text-white" />}
                </button>
              </div>
            )}

            {/* Manual stop for candidate intro */}
            {isCandidateIntro && (
              <button
                onClick={() => { stopVAD(); submitIntroInternal(); }}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-all duration-200"
                style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
              >
                Done introducing
              </button>
            )}

            {/* Submit after manual stop */}
            {canSpeak && transcript && (
              <button onClick={submitAnswer} className="flex items-center gap-2 gradient-btn text-sm px-5 py-2.5">
                <Send size={14} /> Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
