import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, MicOff, Send, Loader2, ChevronRight } from "lucide-react";
import { startInterview, transcribeAudio, evaluateAnswer, endInterview } from "../lib/api";

const STAGES = { LOADING: "loading", QUESTION: "question", RECORDING: "recording", PROCESSING: "processing", FEEDBACK: "feedback", DONE: "done" };

function speak(text) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export default function Interview() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [stage, setStage] = useState(STAGES.LOADING);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [error, setError] = useState("");

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (!state?.resume) { navigate("/"); return; }
    (async () => {
      try {
        const { data } = await startInterview(state.resume, state.jobDescription, 5);
        setQuestions(data.questions);
        setStage(STAGES.QUESTION);
        speak(data.questions[0].question);
      } catch {
        setError("Failed to load interview questions.");
      }
    })();
  }, []);

  const startRecording = async () => {
    setTranscript("");
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.start();
      setStage(STAGES.RECORDING);
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    const mr = mediaRef.current;
    if (!mr) return;
    mr.onstop = async () => {
      setStage(STAGES.PROCESSING);
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      try {
        const { data } = await transcribeAudio(blob);
        setTranscript(data.transcript);
        setStage(STAGES.QUESTION);
      } catch {
        setError("Transcription failed. You can type your answer instead.");
        setStage(STAGES.QUESTION);
      }
    };
    mr.stop();
    mr.stream.getTracks().forEach((t) => t.stop());
  };

  const submitAnswer = async () => {
    if (!transcript.trim()) return;
    setStage(STAGES.PROCESSING);
    try {
      const { data: eval_ } = await evaluateAnswer(questions[current], transcript, state.resume);
      setEvaluation(eval_);
      setAnswers((prev) => [...prev, transcript]);
      setEvaluations((prev) => [...prev, eval_]);
      setStage(STAGES.FEEDBACK);
      speak(eval_.feedback);
    } catch {
      setError("Failed to evaluate answer.");
      setStage(STAGES.QUESTION);
    }
  };

  const nextQuestion = async () => {
    const next = current + 1;
    if (next >= questions.length) {
      setStage(STAGES.PROCESSING);
      try {
        const { data: report } = await endInterview(questions, answers, evaluations);
        navigate("/report", { state: { report } });
      } catch {
        setError("Failed to generate report.");
        setStage(STAGES.FEEDBACK);
      }
      return;
    }
    setCurrent(next);
    setTranscript("");
    setEvaluation(null);
    setStage(STAGES.QUESTION);
    speak(questions[next].question);
  };

  const q = questions[current];
  const isLast = current === questions.length - 1;

  if (stage === STAGES.LOADING) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-zinc-400">
        <Loader2 size={28} className="animate-spin" />
        <p className="text-sm">Preparing your interview...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Question {current + 1} of {questions.length}</span>
        <span className="font-medium text-zinc-600 dark:text-zinc-300">{q?.type} · {q?.difficulty}</span>
      </div>
      <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${((current + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      {q && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
          <p className="text-xs font-medium text-indigo-500 mb-2 uppercase tracking-wide">{q.topic}</p>
          <p className="text-base leading-relaxed">{q.question}</p>
        </div>
      )}

      {/* Transcript */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">Your Answer</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={stage === STAGES.PROCESSING || stage === STAGES.FEEDBACK}
          rows={5}
          placeholder="Record your answer or type it here..."
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900
            text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600
            px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
            disabled:opacity-50"
        />
      </div>

      {/* Controls */}
      {stage !== STAGES.FEEDBACK && (
        <div className="flex gap-3">
          <button
            onClick={stage === STAGES.RECORDING ? stopRecording : startRecording}
            disabled={stage === STAGES.PROCESSING}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${stage === STAGES.RECORDING
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              } disabled:opacity-40`}
          >
            {stage === STAGES.RECORDING ? <><MicOff size={15} /> Stop</> : <><Mic size={15} /> Record</>}
          </button>

          <button
            onClick={submitAnswer}
            disabled={!transcript.trim() || stage === STAGES.PROCESSING}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500
              disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium
              rounded-xl px-4 py-2.5 transition-colors"
          >
            {stage === STAGES.PROCESSING
              ? <><Loader2 size={15} className="animate-spin" /> Processing...</>
              : <><Send size={15} /> Submit Answer</>}
          </button>
        </div>
      )}

      {/* Feedback */}
      {stage === STAGES.FEEDBACK && evaluation && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
          <div className="p-5 flex items-center justify-between">
            <span className="text-sm font-semibold">Feedback</span>
            <span className="text-2xl font-bold text-indigo-500">{evaluation.overall}<span className="text-sm text-zinc-400">/10</span></span>
          </div>
          <div className="p-5 grid grid-cols-4 gap-3 text-center">
            {Object.entries(evaluation.scores).map(([k, v]) => (
              <div key={k}>
                <div className="text-lg font-semibold">{v}</div>
                <div className="text-xs text-zinc-400 capitalize">{k}</div>
              </div>
            ))}
          </div>
          <div className="p-5 space-y-3 text-sm">
            <p className="text-zinc-600 dark:text-zinc-300">{evaluation.feedback}</p>
            {evaluation.model_answer_hints?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Strong answer includes:</p>
                <ul className="space-y-1">
                  {evaluation.model_answer_hints.map((h, i) => (
                    <li key={i} className="flex gap-2 text-zinc-600 dark:text-zinc-300">
                      <span className="text-indigo-400 shrink-0">·</span>{h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="p-4">
            <button
              onClick={nextQuestion}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500
                text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
            >
              {isLast ? "View Full Report" : "Next Question"} <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
