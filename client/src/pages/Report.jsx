import { useLocation, useNavigate } from "react-router-dom";
import { Home, TrendingUp, AlertCircle, BookOpen } from "lucide-react";

export default function Report() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state?.report) { navigate("/"); return null; }
  const r = state.report;

  const gradeColor = {
    A: "text-green-500", B: "text-emerald-500",
    C: "text-amber-500", D: "text-orange-500", F: "text-red-500",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interview Report</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{r.summary}</p>
      </div>

      {/* Overall score */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex items-center gap-6">
        <div className="text-center">
          <div className={`text-5xl font-bold ${gradeColor[r.overall_grade]}`}>{r.overall_grade}</div>
          <div className="text-xs text-zinc-400 mt-1">Overall Grade</div>
        </div>
        <div className="h-12 w-px bg-zinc-200 dark:bg-zinc-800" />
        <div className="text-center">
          <div className="text-5xl font-bold text-indigo-500">{r.overall_score}<span className="text-xl text-zinc-400">/10</span></div>
          <div className="text-xs text-zinc-400 mt-1">Score</div>
        </div>
      </div>

      {/* Strengths & Weak areas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400">
            <TrendingUp size={15} /> Strengths
          </div>
          <ul className="space-y-2">
            {r.strengths?.map((s, i) => (
              <li key={i} className="text-sm text-zinc-600 dark:text-zinc-300 flex gap-2">
                <span className="text-green-400 shrink-0">·</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-500 dark:text-red-400">
            <AlertCircle size={15} /> Weak Areas
          </div>
          <ul className="space-y-2">
            {r.weak_areas?.map((w, i) => (
              <li key={i} className="text-sm text-zinc-600 dark:text-zinc-300 flex gap-2">
                <span className="text-red-400 shrink-0">·</span>{w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Study recommendations */}
      {r.recommended_topics?.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 flex items-center gap-2 text-sm font-semibold border-b border-zinc-200 dark:border-zinc-800">
            <BookOpen size={15} className="text-indigo-400" /> Study Recommendations
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {r.recommended_topics.map((t, i) => (
              <div key={i} className="px-6 py-4 space-y-1">
                <p className="text-sm font-medium">{t.topic}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.reason}</p>
                <p className="text-xs text-indigo-500">{t.resources}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {r.transcript?.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 text-sm font-semibold border-b border-zinc-200 dark:border-zinc-800">
            Full Transcript
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {r.transcript.map((item, i) => (
              <div key={i} className="px-6 py-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.question}</p>
                  <span className="text-sm font-bold text-indigo-500 shrink-0">{item.score}/10</span>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate("/")}
        className="w-full flex items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-700
          hover:bg-zinc-50 dark:hover:bg-zinc-900 text-sm font-medium rounded-xl px-6 py-3 transition-colors"
      >
        <Home size={15} /> Start Over
      </button>
    </div>
  );
}
