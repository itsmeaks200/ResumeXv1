import { useLocation, useNavigate } from "react-router-dom";
import { TrendingUp, AlertCircle, BookOpen, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";

const gradeColors = {
  A: 'var(--success)',
  B: '#10b981',
  C: 'var(--warning)',
  D: '#f97316',
  F: 'var(--danger)',
};

export default function Report() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [showScore, setShowScore] = useState(false);

  useEffect(() => {
    setTimeout(() => setShowScore(true), 300);
  }, []);

  if (!state?.report) { navigate("/"); return null; }
  const r = state.report;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between fade-in-up stagger-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Report</h1>
          <p className="text-sm mt-2 max-w-md leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.summary}</p>
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

      {/* Score hero */}
      <div className="glass-card-static p-8 fade-in-up stagger-2" style={{ borderStyle: 'solid' }}>
        <div className="flex items-center justify-center gap-12">
          <div className="text-center">
            <div
              className="text-7xl font-bold tracking-tighter transition-all duration-700"
              style={{
                color: gradeColors[r.overall_grade],
                transform: showScore ? 'scale(1)' : 'scale(0.5)',
                opacity: showScore ? 1 : 0,
                filter: `drop-shadow(0 0 20px ${gradeColors[r.overall_grade]})`,
              }}
            >
              {r.overall_grade}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Overall Grade</div>
          </div>
          <div
            className="w-px h-20"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--border-glow), transparent)' }}
          />
          <div className="text-center">
            <div
              className="text-6xl font-bold tabular-nums transition-all duration-700 gradient-text"
              style={{
                transform: showScore ? 'scale(1)' : 'scale(0.5)',
                opacity: showScore ? 1 : 0,
              }}
            >
              {r.overall_score}
              <span className="text-xl font-normal" style={{ color: 'var(--text-muted)', WebkitTextFillColor: 'var(--text-muted)' }}>/10</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Score</div>
          </div>
        </div>
      </div>

      {/* Strengths + Weak Areas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card-static p-6 fade-in-up stagger-3 relative overflow-hidden" style={{ borderStyle: 'solid' }}>
          {/* Top gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg, var(--success), #06b6d4)' }} />
          <div className="flex items-center gap-2 text-xs font-semibold mb-4" style={{ color: 'var(--success)' }}>
            <TrendingUp size={14} /> Strengths
          </div>
          <ul className="space-y-2.5">
            {r.strengths?.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="shrink-0" style={{ color: 'var(--success)' }}>·</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-card-static p-6 fade-in-up stagger-4 relative overflow-hidden" style={{ borderStyle: 'solid' }}>
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg, var(--danger), #ec4899)' }} />
          <div className="flex items-center gap-2 text-xs font-semibold mb-4" style={{ color: 'var(--danger)' }}>
            <AlertCircle size={14} /> Weak Areas
          </div>
          <ul className="space-y-2.5">
            {r.weak_areas?.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="shrink-0" style={{ color: 'var(--danger)' }}>·</span>{w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Study Plan */}
      {r.recommended_topics?.length > 0 && (
        <div className="glass-card-static overflow-hidden fade-in-up stagger-5" style={{ borderStyle: 'solid' }}>
          <div
            className="px-6 py-4 flex items-center gap-2.5 text-sm font-semibold"
            style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            <BookOpen size={15} style={{ color: 'var(--accent-mid)' }} /> Study Plan
          </div>
          <div>
            {r.recommended_topics.map((t, i) => (
              <div
                key={i}
                className="px-6 py-5 space-y-1.5"
                style={{ borderBottom: i < r.recommended_topics.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.topic}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.reason}</p>
                <p className="text-xs font-medium" style={{ color: 'var(--accent-mid)' }}>{t.resources}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {r.transcript?.length > 0 && (
        <div className="glass-card-static overflow-hidden fade-in-up stagger-6" style={{ borderStyle: 'solid' }}>
          <div
            className="px-6 py-4 text-sm font-semibold"
            style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            Full Transcript
          </div>
          <div>
            {r.transcript.map((item, i) => (
              <div
                key={i}
                className="px-6 py-5 space-y-2.5"
                style={{
                  borderBottom: i < r.transcript.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.question}</p>
                  <span
                    className="text-xs font-bold shrink-0 tabular-nums px-2.5 py-1 rounded-lg"
                    style={{
                      background: item.score >= 7
                        ? 'var(--success-glow)'
                        : item.score >= 5
                          ? 'var(--warning-glow)'
                          : 'var(--danger-glow)',
                      color: item.score >= 7
                        ? 'var(--success)'
                        : item.score >= 5
                          ? 'var(--warning)'
                          : 'var(--danger)',
                    }}
                  >
                    {item.score}/10
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start over */}
      <button
        onClick={() => navigate("/")}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-4 px-6 rounded-2xl transition-all duration-300"
        style={{
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--accent-start)';
          e.currentTarget.style.background = 'var(--accent-glow)';
          e.currentTarget.style.color = 'var(--accent-mid)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
      >
        <RotateCcw size={14} /> Start Over
      </button>
    </div>
  );
}
