import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

function ScoreRing({ score }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="absolute rotate-[-90deg]" width="112" height="112">
        <circle cx="56" cy="56" r={radius} stroke="#e4e4e7" strokeWidth="8" fill="none" className="dark:stroke-zinc-800" />
        <circle
          cx="56" cy="56" r={radius}
          stroke={color} strokeWidth="8" fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="text-center">
        <div className="text-2xl font-bold" style={{ color }}>{score}</div>
        <div className="text-xs text-zinc-400">/100</div>
      </div>
    </div>
  );
}

function Pill({ label, variant }) {
  const styles = {
    green: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400",
    red: "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${styles[variant]}`}>
      {variant === "green" ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

function SectionBar({ label, score }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500 dark:text-zinc-400 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{score}</span>
    </div>
  );
}

export default function Results() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [showSuggestions, setShowSuggestions] = useState(false);

  if (!state?.atsResult) {
    navigate("/");
    return null;
  }

  const { atsResult, resume, jobDescription } = state;

  const gradeColor = {
    A: "text-green-500", B: "text-emerald-500",
    C: "text-amber-500", D: "text-orange-500", F: "text-red-500",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ATS Results</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{atsResult.summary}</p>
      </div>

      {/* Score card */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex items-center gap-8">
        <ScoreRing score={atsResult.score} />
        <div className="space-y-3 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${gradeColor[atsResult.grade]}`}>{atsResult.grade}</span>
            <span className="text-sm text-zinc-400">grade</span>
          </div>
          <div className="space-y-2">
            {Object.entries(atsResult.section_scores).map(([key, val]) => (
              <SectionBar key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} score={val} />
            ))}
          </div>
        </div>
      </div>

      {/* Keywords */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Keywords</h2>
        <div>
          <p className="text-xs font-medium text-zinc-500 mb-2">Matched</p>
          <div className="flex flex-wrap gap-2">
            {atsResult.matched_keywords.map((kw) => <Pill key={kw} label={kw} variant="green" />)}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500 mb-2">Missing</p>
          <div className="flex flex-wrap gap-2">
            {atsResult.missing_keywords.map((kw) => <Pill key={kw} label={kw} variant="red" />)}
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {atsResult.suggestions?.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            Improvement Suggestions ({atsResult.suggestions.length})
            {showSuggestions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showSuggestions && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
              {atsResult.suggestions.map((s, i) => (
                <div key={i} className="px-6 py-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded">
                      {s.section}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{s.issue}</p>
                  <p className="text-sm text-indigo-600 dark:text-indigo-400">{s.fix}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => navigate("/interview", { state: { resume, jobDescription } })}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500
          text-white text-sm font-medium rounded-xl px-6 py-3 transition-colors duration-150"
      >
        Start Mock Interview <ArrowRight size={16} />
      </button>
    </div>
  );
}
