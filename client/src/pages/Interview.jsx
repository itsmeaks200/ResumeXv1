import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, MicOff, Send, Loader2, ChevronRight, WifiOff, RotateCcw, Volume2, Clock } from "lucide-react";
import { createInterviewSocket, playAudio } from "../lib/interview-socket";

const STAGES = {
  CONNECTING: "connecting",
  SPEAKING:   "speaking",    // TTS audio is playing
  QUESTION:   "question",    // Ready for user input
  LISTENING:  "listening",   // User is speaking
  PROCESSING: "processing",  // Awaiting evaluation
  FEEDBACK:   "feedback",    // Evaluation shown, waiting for Next
  ERROR:      "error",
};

// ── Speech recognition hook ─────────────────────────────────────────
function useSpeechRecognition(onInterim, onFinal) {
  const recRef = useRef(null);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
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
    rec.onerror = (e) => console.warn("SpeechRecognition error:", e.error);
    rec.start();
    recRef.current = rec;
    return true;
  }, [onInterim, onFinal]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  return { start, stop };
}

// ── Interviewer avatar with animated sound bars ────────────────────
function InterviewerAvatar({ stage }) {
  const isSpeaking = stage === STAGES.SPEAKING;
  const isListening = stage === STAGES.LISTENING;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar circle + pulse rings */}
      <div className="relative w-28 h-28 flex items-center justify-center">
        {isSpeaking && (
          <>
            <div className="absolute inset-0 rounded-full pulse-ring"
              style={{ border: '2px solid rgba(139, 92, 246, 0.3)' }} />
            <div className="absolute inset-0 rounded-full pulse-ring"
              style={{ border: '2px solid rgba(6, 182, 212, 0.2)', animationDelay: '0.6s' }} />
          </>
        )}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-sm font-bold text-white relative z-10 select-none transition-all duration-500"
          style={{
            background: 'linear-gradient(135deg, var(--accent-start), var(--accent-end))',
            boxShadow: isSpeaking
              ? '0 0 40px rgba(139, 92, 246, 0.5), 0 0 80px rgba(139, 92, 246, 0.15)'
              : '0 0 20px var(--accent-glow)',
          }}
        >
          AI
        </div>
      </div>

      {/* Equalizer bars */}
      <div className="flex items-end gap-1 h-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-1.5 rounded-full transition-all duration-300"
            style={{
              background: isListening
                ? 'linear-gradient(to top, var(--success), #06b6d4)'
                : 'linear-gradient(to top, var(--accent-start), var(--accent-end))',
              animation: (isSpeaking || isListening) ? `bounce-bar 0.${4 + (i % 4)}s ease-in-out ${i * 0.09}s infinite` : 'none',
              height: (isSpeaking || isListening) ? `${10 + (i % 3) * 8}px` : '5px',
              opacity: (isSpeaking || isListening) ? 1 : 0.25,
            }}
          />
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: isSpeaking ? 'var(--accent-mid)' : isListening ? 'var(--success)' : 'var(--text-muted)',
            boxShadow: isSpeaking
              ? '0 0 8px rgba(167, 139, 250, 0.7)'
              : isListening
                ? '0 0 8px rgba(34, 197, 94, 0.7)'
                : 'none',
            animation: (isSpeaking || isListening) ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
          }}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {isSpeaking ? 'Interviewer speaking' : isListening ? 'You are speaking' : 'ResumeX AI'}
        </span>
      </div>
    </div>
  );
}

// ── Chat message bubble ─────────────────────────────────────────────
function MessageBubble({ msg }) {
  if (msg.role === "interviewer") {
    return (
      <div className="flex gap-3 items-start fade-in">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent-start), var(--accent-end))' }}
        >
          AI
        </div>
        <div className="max-w-[82%] space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            {msg.isFollowUp && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-end)' }}>
                ↩ Follow-up
              </span>
            )}
            <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: 'var(--accent-glow)', color: 'var(--accent-mid)' }}>
              {msg.meta?.topic}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{msg.meta?.type}</span>
            <span
              className="text-xs font-semibold"
              style={{
                color: msg.meta?.difficulty === 'Hard'
                  ? 'var(--danger)'
                  : msg.meta?.difficulty === 'Medium'
                    ? 'var(--warning)'
                    : 'var(--success)',
              }}
            >
              {msg.meta?.difficulty}
            </span>
          </div>
          <div
            className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
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
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(6, 182, 212, 0.12))',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              color: 'var(--text-primary)',
            }}
          >
            {msg.content}
          </div>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
        >
          You
        </div>
      </div>
    );
  }

  if (msg.role === "feedback") {
    const ev = msg.content;
    const scoreColor = ev.overall >= 7 ? 'var(--success)' : ev.overall >= 5 ? 'var(--warning)' : 'var(--danger)';
    return (
      <div className="fade-in ml-11">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Feedback</span>
              <div className="flex gap-2">
                {Object.entries(ev.scores ?? {}).map(([k, v]) => (
                  <span key={k} className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-card-hover)', color: 'var(--text-secondary)' }}>
                    {k}: <strong style={{ color: 'var(--text-primary)' }}>{v}</strong>
                  </span>
                ))}
              </div>
            </div>
            <span className="text-xl font-bold tabular-nums" style={{ color: scoreColor }}>
              {ev.overall}<span className="text-xs font-normal ml-0.5" style={{ color: 'var(--text-muted)' }}>/10</span>
            </span>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ev.feedback}</p>
            {ev.model_answer_hints?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Strong answer includes</p>
                <ul className="space-y-1.5">
                  {ev.model_answer_hints.map((h, i) => (
                    <li key={i} className="flex gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span className="shrink-0 mt-0.5" style={{ color: 'var(--accent-mid)' }}>→</span>{h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ── Main component ──────────────────────────────────────────────────
export default function Interview() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [stage, setStage] = useState(STAGES.CONNECTING);
  const [messages, setMessages] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 5 });
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);

  const socketRef = useRef(null);
  const accumulatedRef = useRef("");
  const mediaRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);

  const onInterim = useCallback((t) => setInterimText(t), []);
  const onFinal = useCallback((t) => {
    accumulatedRef.current += " " + t;
    setTranscript(accumulatedRef.current.trim());
    setInterimText("");
  }, []);

  const { start: startSR, stop: stopSR } = useSpeechRecognition(onInterim, onFinal);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcript, interimText]);

  useEffect(() => {
    if (!state?.resume) { navigate("/"); return; }

    const socket = createInterviewSocket({
      onOpen: () => {
        setWsConnected(true);
        socket.send("start", {
          resume: state.resume,
          jobDescription: state.jobDescription,
          questionCount: state.questionCount ?? 5,
          duration: state.duration ?? 30,
        });
      },
      onClose: () => setWsConnected(false),
      onError: () => {
        setError("Connection lost. Please refresh and try again.");
        setStage(STAGES.ERROR);
      },
      onMessage: (msg) => {
        if (msg.type === "question" || msg.type === "followup") {
          const isFollowUp = msg.type === "followup";
          setCurrentQuestion(msg.question);
          setProgress({ current: msg.index + 1, total: msg.total });
          setTranscript("");
          setInterimText("");
          accumulatedRef.current = "";

          setMessages((prev) => [
            ...prev,
            {
              role: "interviewer",
              content: msg.question.question,
              meta: {
                type: msg.question.type,
                topic: msg.question.topic,
                difficulty: msg.question.difficulty,
              },
              isFollowUp,
            },
          ]);

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
          setMessages((prev) => [...prev, { role: "feedback", content: msg.evaluation }]);
          setStage(STAGES.FEEDBACK);
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
    return () => socket.close();
  }, []);

  const startListening = async () => {
    accumulatedRef.current = "";
    setTranscript("");
    setInterimText("");
    audioChunksRef.current = [];
    setError("");

    startSR();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.start(3000);
      mediaRef.current = mr;
    } catch {
      // mic denied — SpeechRecognition only
    }

    setStage(STAGES.LISTENING);
  };

  const stopListening = () => {
    stopSR();
    setInterimText("");

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
      };
      mediaRef.current.stop();
      mediaRef.current.stream.getTracks().forEach((t) => t.stop());
    }

    setStage(STAGES.QUESTION);
  };

  const submitAnswer = () => {
    const final = transcript.trim();
    if (!final || final.length < 5) {
      setError("Answer too short. Please say more.");
      return;
    }
    setError("");
    setMessages((prev) => [...prev, { role: "user", content: final }]);
    setTranscript("");
    setStage(STAGES.PROCESSING);
    socketRef.current?.send("answer_done", { transcript: final });
  };

  const handleNext = () => {
    setStage(STAGES.PROCESSING);
    socketRef.current?.send("next");
  };

  // ── Full-screen loading ─────────────────────────────────────────
  if (stage === STAGES.CONNECTING) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={26} className="animate-spin" style={{ color: 'var(--accent-mid)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Setting up your interview room...</p>
      </div>
    );
  }

  if (stage === STAGES.ERROR) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <WifiOff size={22} style={{ color: 'var(--danger)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
        <button onClick={() => navigate("/")} className="flex items-center gap-2 gradient-btn text-sm px-4 py-2">
          <RotateCcw size={14} /> Start over
        </button>
      </div>
    );
  }

  const pct = (progress.current / progress.total) * 100;
  const isSpeaking = stage === STAGES.SPEAKING;
  const isListening = stage === STAGES.LISTENING;
  const isProcessing = stage === STAGES.PROCESSING;
  const isFeedback = stage === STAGES.FEEDBACK;
  const canSpeak = stage === STAGES.QUESTION;

  return (
    // Break out of Layout's px-6 py-16 padding to fill the viewport below the nav
    <div className="-mx-6 -my-16 flex" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Left panel: Interviewer ─────────────────────────────── */}
      <div
        className="w-72 shrink-0 flex flex-col items-center justify-between py-8 px-5"
        style={{ borderRight: '1px solid var(--border-subtle)' }}
      >
        {/* Avatar + status */}
        <div className="flex flex-col items-center gap-6 w-full">
          <InterviewerAvatar stage={stage} />

          {/* Progress */}
          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Question {progress.current} / {progress.total}</span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {state?.duration ?? 30} min
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, var(--accent-start), var(--accent-end))',
                  boxShadow: '0 0 8px var(--accent-glow)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Current question preview */}
        {currentQuestion && (
          <div className="w-full flex-1 mt-6 overflow-y-auto space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-md"
                style={{ background: 'var(--accent-glow)', color: 'var(--accent-mid)' }}
              >
                {currentQuestion.topic}
              </span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-md"
                style={{
                  color: currentQuestion.difficulty === 'Hard'
                    ? 'var(--danger)'
                    : currentQuestion.difficulty === 'Medium'
                      ? 'var(--warning)'
                      : 'var(--success)',
                }}
              >
                {currentQuestion.difficulty}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {currentQuestion.question}
            </p>
          </div>
        )}

        {/* Connection dot */}
        <div className="flex items-center gap-2 mt-4">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: wsConnected ? 'var(--success)' : 'var(--danger)',
              boxShadow: wsConnected ? '0 0 6px rgba(34, 197, 94, 0.5)' : '0 0 6px rgba(239, 68, 68, 0.5)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {wsConnected ? "Live" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* ── Right panel: Conversation + Controls ────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Scrollable conversation area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                The conversation will appear here
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {/* Live transcript preview while speaking */}
          {isListening && (transcript || interimText) && (
            <div className="flex gap-3 items-start justify-end fade-in">
              <div className="max-w-[82%]">
                <div
                  className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
                  style={{
                    background: 'rgba(139, 92, 246, 0.08)',
                    border: '1px dashed rgba(139, 92, 246, 0.3)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span>{transcript}</span>
                  {interimText && (
                    <span style={{ color: 'var(--text-muted)' }}> {interimText}</span>
                  )}
                </div>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
              >
                You
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Controls bar ─────────────────────────────────────── */}
        <div
          className="flex items-center gap-4 px-6 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {/* Status / hint text */}
          <div className="flex-1 min-w-0">
            {isSpeaking && (
              <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Volume2 size={12} />
                Interviewer is speaking...
              </span>
            )}
            {canSpeak && !transcript && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Click the mic to start your answer
              </span>
            )}
            {canSpeak && transcript && (
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                "{transcript}"
              </p>
            )}
            {isListening && (
              <div className="flex items-center gap-2">
                <div className="flex items-end gap-0.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full"
                      style={{
                        height: '12px',
                        background: 'linear-gradient(to top, var(--success), #06b6d4)',
                        animation: `bounce-bar 0.5s ease-in-out ${i * 0.1}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs" style={{ color: 'var(--success)' }}>Recording...</span>
              </div>
            )}
            {isProcessing && (
              <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={12} className="animate-spin" />
                Evaluating your answer...
              </span>
            )}
            {isFeedback && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Review feedback, then continue when ready
              </span>
            )}
            {error && (
              <span className="text-xs" style={{ color: 'var(--danger)' }}>{error}</span>
            )}
          </div>

          {/* Mic button */}
          {(canSpeak || isListening) && (
            <div className="relative flex items-center justify-center">
              {isListening && (
                <div
                  className="absolute w-12 h-12 rounded-full pulse-ring"
                  style={{ border: '2px solid rgba(239, 68, 68, 0.35)' }}
                />
              )}
              <button
                onClick={isListening ? stopListening : startListening}
                className="relative z-10 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  background: isListening
                    ? 'linear-gradient(135deg, var(--danger), #ec4899)'
                    : 'linear-gradient(135deg, var(--accent-start), var(--accent-end))',
                  boxShadow: isListening
                    ? '0 0 20px rgba(239, 68, 68, 0.4)'
                    : '0 0 15px var(--accent-glow)',
                }}
              >
                {isListening
                  ? <MicOff size={16} className="text-white" />
                  : <Mic size={16} className="text-white" />}
              </button>
            </div>
          )}

          {/* Submit — after stopped recording with content */}
          {canSpeak && transcript && (
            <button
              onClick={submitAnswer}
              className="flex items-center gap-2 gradient-btn text-sm px-5 py-2.5"
            >
              <Send size={14} /> Submit
            </button>
          )}

          {/* Next — after feedback */}
          {isFeedback && (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 gradient-btn text-sm px-5 py-2.5"
            >
              {progress.current >= progress.total ? "View Report" : "Next Question"}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
