import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, ArrowRight, RotateCcw, Clock } from "lucide-react";
import { useState, useEffect } from "react";

const DURATIONS = [
  { label: "15 min", minutes: 15, desc: "Quick screen" },
  { label: "30 min", minutes: 30, desc: "Standard" },
  { label: "1 hour", minutes: 60, desc: "Full loop round" },
];

function ScoreRing({ score }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const gradientId = "scoreGradient";
  const [animate, setAnimate] = useState(false);
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    setTimeout(() => setAnimate(true), 200);
    // Count-up animation
    let start = 0;
    const step = score / 40;
    const interval = setInterval(() => {
      start += step;
      if (start >= score) {
        setDisplayScore(score);
        clearInterval(interval);
      } else {
        setDisplayScore(Math.round(start));
      }
    }, 25);
    return () => clearInterval(interval);
  }, [score]);

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      {/* Glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: score >= 75
            ? 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)'
            : score >= 50
              ? 'radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)',
          filter: 'blur(10px)',
        }}
      />
      <svg className="-rotate-90 absolute" width="144" height="144">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444"} />
            <stop offset="100%" stopColor={score >= 75 ? "#06b6d4" : score >= 50 ? "#f97316" : "#ec4899"} />
          </linearGradient>
        </defs>
        <circle cx="72" cy="72" r={r} strokeWidth="6" fill="none"
          style={{ stroke: 'var(--border-subtle)' }} />
        <circle cx="72" cy="72" r={r} stroke={`url(#${gradientId})`} strokeWidth="6" fill="none"
          strokeDasharray={circ}
          strokeDashoffset={animate ? offset : circ}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.3))',
          }}
        />
      </svg>
      <div className="text-center relative z-10">
        <div className="text-4xl font-bold tabular-nums gradient-text">{displayScore}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>/ 100</div>
      </div>
    </div>
  );
}

function Bar({ label, score }) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => { setTimeout(() => setAnimate(true), 300); }, []);

  const color = score >= 75
    ? 'linear-gradient(90deg, #22c55e, #06b6d4)'
    : score >= 50
      ? 'linear-gradient(90deg, #f59e0b, #f97316)'
      : 'linear-gradient(90deg, #ef4444, #ec4899)';

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 text-xs capitalize shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: animate ? `${score}%` : '0%',
            background: color,
            boxShadow: `0 0 8px ${score >= 75 ? 'rgba(34, 197, 94, 0.3)' : score >= 50 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-7 text-right" style={{ color: 'var(--text-primary)' }}>{score}</span>
    </div>
  );
}

function Keyword({ label, matched }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-200"
      style={{
        background: matched ? 'var(--success-glow)' : 'var(--danger-glow)',
        color: matched ? 'var(--success)' : 'var(--danger)',
        border: `1px solid ${matched ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
      }}
    >
      {matched ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

const gradeColors = {
  A: 'var(--success)',
  B: '#10b981',
  C: 'var(--warning)',
  D: '#f97316',
  F: 'var(--danger)',
};

export default function Results() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[1]); // 30 min default

  if (!state?.atsResult) { navigate("/"); return null; }
  const { atsResult, resume, jobDescription } = state;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between fade-in-up stagger-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ATS Report</h1>
          <p className="text-sm mt-2 max-w-md leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{atsResult.summary}</p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 mt-1"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <RotateCcw size={12} /> New
        </button>
      </div>

      {/* Score + sections */}
      <div className="glass-card-static p-7 flex items-center gap-10 fade-in-up stagger-2" style={{ borderStyle: 'solid' }}>
        <ScoreRing score={atsResult.score} />
        <div className="flex-1 space-y-3">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-6xl font-bold tracking-tight" style={{ color: gradeColors[atsResult.grade] }}>{atsResult.grade}</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>grade</span>
          </div>
          {Object.entries(atsResult.section_scores ?? {}).map(([k, v]) => <Bar key={k} label={k} score={v} />)}
        </div>
      </div>

      {/* Keywords */}
      <div className="glass-card-static p-6 space-y-5 fade-in-up stagger-3" style={{ borderStyle: 'solid' }}>
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Keywords</h2>
        <div>
          <p className="text-xs mb-2.5" style={{ color: 'var(--text-muted)' }}>
            Matched <span className="font-semibold" style={{ color: 'var(--success)' }}>({atsResult.matched_keywords?.length ?? 0})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {atsResult.matched_keywords?.map(k => <Keyword key={k} label={k} matched />)}
          </div>
        </div>
        <div>
          <p className="text-xs mb-2.5" style={{ color: 'var(--text-muted)' }}>
            Missing <span className="font-semibold" style={{ color: 'var(--danger)' }}>({atsResult.missing_keywords?.length ?? 0})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {atsResult.missing_keywords?.map(k => <Keyword key={k} label={k} matched={false} />)}
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {atsResult.suggestions?.length > 0 && (
        <div className="glass-card-static overflow-hidden fade-in-up stagger-4" style={{ borderStyle: 'solid' }}>
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Improvement Suggestions
            <span className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {atsResult.suggestions.length} items {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {open && (
            <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {atsResult.suggestions.map((s, i) => (
                <div
                  key={i}
                  className="px-6 py-4 space-y-2"
                  style={{ borderBottom: i < atsResult.suggestions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                >
                  <span
                    className="text-xs font-medium px-2.5 py-0.5 rounded-md"
                    style={{
                      background: 'var(--bg-card-hover)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {s.section}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.issue}</p>
                  <p className="text-sm" style={{ color: 'var(--accent-mid)' }}>{s.fix}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Interview duration picker + CTA */}
      <div className="glass-card-static p-5 space-y-4 fade-in-up stagger-5" style={{ borderStyle: 'solid' }}>
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Interview Duration
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DURATIONS.map((d) => {
            const active = selectedDuration.minutes === d.minutes;
            return (
              <button
                key={d.minutes}
                onClick={() => setSelectedDuration(d)}
                className="flex flex-col items-center gap-0.5 py-3 px-2 rounded-xl transition-all duration-200"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))'
                    : 'var(--bg-card-hover)',
                  border: active
                    ? '1px solid rgba(139, 92, 246, 0.4)'
                    : '1px solid var(--border-subtle)',
                  boxShadow: active ? '0 0 16px var(--accent-glow)' : 'none',
                }}
              >
                <span className="text-sm font-bold" style={{ color: active ? 'var(--accent-mid)' : 'var(--text-primary)' }}>
                  {d.label}
                </span>
                <span className="text-xs" style={{ color: active ? 'var(--accent-end)' : 'var(--text-muted)' }}>{d.desc}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => navigate("/interview", {
            state: {
              resume,
              jobDescription,
              duration: selectedDuration.minutes,
            },
          })}
          className="w-full flex items-center justify-center gap-2.5 gradient-btn text-sm py-3.5 px-6"
        >
          Start Mock Interview <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
