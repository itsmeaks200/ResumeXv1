import { useLocation, useNavigate } from "react-router-dom";
import { TrendingUp, AlertCircle, BookOpen, RotateCcw, ChevronDown, ChevronUp, CheckSquare, Zap } from "lucide-react";
import { useState, useEffect } from "react";

const gradeColors = {
  A: "var(--success)", B: "#10b981", C: "var(--warning)", D: "#f97316", F: "var(--danger)",
};

function SkillBar({ label, value }) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => { setTimeout(() => setAnimate(true), 400); }, []);
  const color = value >= 7 ? "linear-gradient(90deg,#22c55e,#06b6d4)" : value >= 5 ? "linear-gradient(90deg,#f59e0b,#f97316)" : "linear-gradient(90deg,#ef4444,#ec4899)";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-36 shrink-0 capitalize" style={{ color: "var(--text-secondary)" }}>
        {label.replace(/_/g, " ")}
      </span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: animate ? `${value * 10}%` : "0%", background: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-6 text-right" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function TranscriptItem({ item, index }) {
  const [open, setOpen] = useState(false);
  const scoreColor = item.score >= 7 ? "var(--success)" : item.score >= 5 ? "var(--warning)" : "var(--danger)";
  const scoreBg = item.score >= 7 ? "var(--success-glow)" : item.score >= 5 ? "var(--warning-glow)" : "var(--danger-glow)";

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-4 px-6 py-4 text-left transition-colors"
        onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hover)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0"
            style={{ background: scoreBg, color: scoreColor }}
          >
            {item.score}/10
          </span>
          {item.isFollowUp && (
            <span className="text-xs px-2 py-0.5 rounded-md shrink-0" style={{ background: "rgba(6,182,212,0.1)", color: "var(--accent-end)" }}>
              probe
            </span>
          )}
          {item.type && (
            <span className="text-xs px-2 py-0.5 rounded-md shrink-0" style={{ background: "var(--accent-glow)", color: "var(--accent-mid)" }}>
              {item.type}
            </span>
          )}
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{item.question}</p>
        </div>
        <div style={{ color: "var(--text-muted)", shrink: 0 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-6 pb-5 space-y-4">
          {/* Answer */}
          <div
            className="px-4 py-3 rounded-xl text-sm leading-relaxed"
            style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.08),rgba(6,182,212,0.05))", border: "1px solid rgba(139,92,246,0.15)", color: "var(--text-secondary)" }}
          >
            {item.answer || <em style={{ color: "var(--text-muted)" }}>No answer recorded</em>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {item.what_was_good && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--success)" }}>What worked</p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.what_was_good}</p>
              </div>
            )}
            {item.what_was_missing && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--danger)" }}>What was missing</p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.what_was_missing}</p>
              </div>
            )}
          </div>

          {item.feedback && (
            <p className="text-xs leading-relaxed px-1" style={{ color: "var(--text-muted)" }}>{item.feedback}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Report() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [showScore, setShowScore] = useState(false);

  useEffect(() => { setTimeout(() => setShowScore(true), 300); }, []);

  if (!state?.report) { navigate("/dashboard"); return null; }
  const r = state.report;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between fade-in-up stagger-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Report</h1>
          <p className="text-sm mt-2 max-w-md leading-relaxed" style={{ color: "var(--text-secondary)" }}>{r.summary}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 mt-1"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-card-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <RotateCcw size={12} /> Dashboard
        </button>
      </div>

      {/* Score hero */}
      <div className="glass-card-static p-8 fade-in-up stagger-2" style={{ borderStyle: "solid" }}>
        <div className="flex items-center justify-center gap-12">
          <div className="text-center">
            <div
              className="text-7xl font-bold tracking-tighter transition-all duration-700"
              style={{
                color: gradeColors[r.overall_grade],
                transform: showScore ? "scale(1)" : "scale(0.5)",
                opacity: showScore ? 1 : 0,
                filter: `drop-shadow(0 0 20px ${gradeColors[r.overall_grade]})`,
              }}
            >
              {r.overall_grade}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Overall Grade</div>
          </div>
          <div className="w-px h-20" style={{ background: "linear-gradient(to bottom,transparent,var(--border-glow),transparent)" }} />
          <div className="text-center">
            <div
              className="text-6xl font-bold tabular-nums gradient-text transition-all duration-700"
              style={{ transform: showScore ? "scale(1)" : "scale(0.5)", opacity: showScore ? 1 : 0 }}
            >
              {r.overall_score}
              <span className="text-xl font-normal" style={{ color: "var(--text-muted)", WebkitTextFillColor: "var(--text-muted)" }}>/10</span>
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Score</div>
          </div>
        </div>
      </div>

      {/* Skill breakdown */}
      {r.skill_breakdown && (
        <div className="glass-card-static p-6 space-y-4 fade-in-up stagger-3" style={{ borderStyle: "solid" }}>
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Skill Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(r.skill_breakdown).map(([k, v]) => (
              <SkillBar key={k} label={k} value={v} />
            ))}
          </div>
        </div>
      )}

      {/* Strengths + Weak areas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card-static p-6 fade-in-up stagger-3 relative overflow-hidden" style={{ borderStyle: "solid" }}>
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg,var(--success),#06b6d4)" }} />
          <div className="flex items-center gap-2 text-xs font-semibold mb-4" style={{ color: "var(--success)" }}>
            <TrendingUp size={14} /> Strengths
          </div>
          <ul className="space-y-2.5">
            {r.strengths?.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="shrink-0" style={{ color: "var(--success)" }}>·</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-card-static p-6 fade-in-up stagger-4 relative overflow-hidden" style={{ borderStyle: "solid" }}>
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg,var(--danger),#ec4899)" }} />
          <div className="flex items-center gap-2 text-xs font-semibold mb-4" style={{ color: "var(--danger)" }}>
            <AlertCircle size={14} /> Weak Areas
          </div>
          <ul className="space-y-2.5">
            {r.weak_areas?.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="shrink-0" style={{ color: "var(--danger)" }}>·</span>{w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action items */}
      {r.action_items?.length > 0 && (
        <div className="glass-card-static p-6 space-y-4 fade-in-up stagger-4" style={{ borderStyle: "solid" }}>
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--accent-mid)" }}>
            <Zap size={14} /> This Week's Action Items
          </div>
          <ul className="space-y-3">
            {r.action_items.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                <CheckSquare size={15} className="shrink-0 mt-0.5" style={{ color: "var(--accent-mid)" }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Study plan */}
      {r.recommended_topics?.length > 0 && (
        <div className="glass-card-static overflow-hidden fade-in-up stagger-5" style={{ borderStyle: "solid" }}>
          <div className="px-6 py-4 flex items-center gap-2.5 text-sm font-semibold" style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
            <BookOpen size={15} style={{ color: "var(--accent-mid)" }} /> Study Plan
          </div>
          {r.recommended_topics.map((t, i) => (
            <div
              key={i}
              className="px-6 py-5 space-y-1.5"
              style={{ borderBottom: i < r.recommended_topics.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.topic}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{t.reason}</p>
              <p className="text-xs font-medium" style={{ color: "var(--accent-mid)" }}>{t.resources}</p>
            </div>
          ))}
        </div>
      )}

      {/* Per-question transcript */}
      {r.transcript?.length > 0 && (
        <div className="glass-card-static overflow-hidden fade-in-up stagger-6" style={{ borderStyle: "solid" }}>
          <div className="px-6 py-4 text-sm font-semibold" style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
            Question-by-Question Breakdown
          </div>
          {r.transcript.map((item, i) => (
            <TranscriptItem key={i} item={item} index={i} />
          ))}
        </div>
      )}

      {/* Practice again */}
      <button
        onClick={() => navigate("/dashboard")}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-4 px-6 rounded-2xl transition-all duration-300"
        style={{ color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", background: "transparent" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-start)"; e.currentTarget.style.background = "var(--accent-glow)"; e.currentTarget.style.color = "var(--accent-mid)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-subtle)"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
      >
        <RotateCcw size={14} /> Practice Again
      </button>
    </div>
  );
}
