import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, Trash2, ChevronDown, ChevronUp, ArrowRight,
  Clock, Upload, Loader2, Plus, Calendar,
} from "lucide-react";
import { listResumes, getResume, deleteResume, analyzeResume } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const DURATIONS = [
  { label: "15 min", minutes: 15, questions: 3, desc: "Quick screen" },
  { label: "30 min", minutes: 30, questions: 5, desc: "Standard" },
  { label: "1 hour", minutes: 60, questions: 8, desc: "Full loop" },
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [jd, setJd] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[1]);
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    listResumes()
      .then((r) => setResumes(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
    setJd("");
    setActionError("");
  }

  async function handleDelete(id) {
    try {
      await deleteResume(id);
      setResumes((prev) => prev.filter((r) => r._id !== id));
      if (expandedId === id) setExpandedId(null);
      setDeleteConfirm(null);
    } catch {
      setActionError("Failed to delete resume.");
    }
  }

  async function handleAnalyze() {
    if (!jd.trim()) { setActionError("Paste a job description first."); return; }
    setAnalyzing(true);
    setActionError("");
    try {
      const [resumeDoc, atsRes] = await Promise.all([
        getResume(expandedId),
        analyzeResume(null, jd, expandedId),
      ]);
      navigate("/results", {
        state: {
          atsResult: atsRes.data,
          resume: resumeDoc.data.parsedData,
          jobDescription: jd,
          resumeId: expandedId,
        },
      });
    } catch (err) {
      setActionError(err.response?.data?.error || "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleStartInterview() {
    if (!jd.trim()) { setActionError("Paste a job description first."); return; }
    setStarting(true);
    setActionError("");
    try {
      const resumeDoc = await getResume(expandedId);
      navigate("/interview", {
        state: {
          resume: resumeDoc.data.parsedData,
          jobDescription: jd,
          questionCount: selectedDuration.questions,
          duration: selectedDuration.minutes,
        },
      });
    } catch {
      setActionError("Failed to load resume.");
      setStarting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between fade-in-up stagger-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Resumes</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {user?.name ? `Hi ${user.name.split(" ")[0]} —` : ""} select a resume to analyze or practice interview
          </p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all duration-200 gradient-btn"
        >
          <Plus size={15} /> Upload New
        </button>
      </div>

      {/* Resume list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-muted)" }} />
        </div>
      ) : resumes.length === 0 ? (
        <div
          className="glass-card-static p-12 text-center fade-in-up stagger-2"
          style={{ borderStyle: "dashed" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-subtle)" }}
          >
            <FileText size={22} style={{ color: "var(--text-muted)" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>No resumes yet</p>
          <p className="text-xs mt-1 mb-5" style={{ color: "var(--text-muted)" }}>
            Upload your first resume to get started
          </p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 gradient-btn text-sm px-5 py-2.5"
          >
            <Upload size={14} /> Upload Resume
          </button>
        </div>
      ) : (
        <div className="space-y-3 fade-in-up stagger-2">
          {resumes.map((resume) => {
            const expanded = expandedId === resume._id;
            return (
              <div
                key={resume._id}
                className="glass-card-static overflow-hidden transition-all duration-300"
                style={{
                  borderStyle: "solid",
                  borderColor: expanded ? "rgba(139, 92, 246, 0.35)" : "var(--border-subtle)",
                  boxShadow: expanded ? "0 0 24px var(--accent-glow)" : "none",
                }}
              >
                {/* Resume row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => toggleExpand(resume._id)}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: expanded ? "var(--accent-glow)" : "var(--bg-card-hover)",
                      border: expanded ? "1px solid rgba(139, 92, 246, 0.3)" : "1px solid var(--border-subtle)",
                    }}
                  >
                    <FileText size={16} style={{ color: expanded ? "var(--accent-mid)" : "var(--text-muted)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {resume.filename}
                    </p>
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "var(--text-muted)" }}>
                      <Calendar size={10} /> {formatDate(resume.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {deleteConfirm === resume._id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Delete?</span>
                        <button
                          onClick={() => handleDelete(resume._id)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ background: "var(--danger-glow)", color: "var(--danger)" }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(resume._id); }}
                        className="p-2 rounded-lg transition-all duration-200"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-glow)"; e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <div style={{ color: "var(--text-muted)" }}>
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Expanded panel */}
                {expanded && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div className="p-5 space-y-4">
                      <div>
                        <label className="text-xs font-medium uppercase tracking-widest block mb-2" style={{ color: "var(--text-muted)" }}>
                          Job Description
                        </label>
                        <textarea
                          value={jd}
                          onChange={(e) => { setJd(e.target.value); setActionError(""); }}
                          rows={5}
                          placeholder="Paste the job description you want to match against..."
                          className="w-full glass-input px-4 py-3 text-sm resize-none"
                        />
                      </div>

                      {/* Duration picker (for interview) */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Clock size={13} style={{ color: "var(--text-muted)" }} />
                          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
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
                                className="flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl transition-all duration-200"
                                style={{
                                  background: active
                                    ? "linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))"
                                    : "var(--bg-card-hover)",
                                  border: active
                                    ? "1px solid rgba(139, 92, 246, 0.4)"
                                    : "1px solid var(--border-subtle)",
                                }}
                              >
                                <span className="text-sm font-bold" style={{ color: active ? "var(--accent-mid)" : "var(--text-primary)" }}>
                                  {d.label}
                                </span>
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.questions} questions</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {actionError && (
                        <div
                          className="text-sm rounded-xl px-4 py-3"
                          style={{
                            background: "var(--danger-glow)",
                            color: "var(--danger)",
                            border: "1px solid rgba(239, 68, 68, 0.2)",
                          }}
                        >
                          {actionError}
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={handleAnalyze}
                          disabled={analyzing || starting}
                          className="flex-1 flex items-center justify-center gap-2 text-sm py-3 px-4 rounded-xl font-medium transition-all duration-200"
                          style={{
                            background: "var(--bg-card-hover)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-primary)",
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.4)"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}
                        >
                          {analyzing ? <Loader2 size={15} className="animate-spin" /> : null}
                          {analyzing ? "Analyzing..." : "ATS Score"}
                        </button>
                        <button
                          onClick={handleStartInterview}
                          disabled={analyzing || starting}
                          className="flex-1 flex items-center justify-center gap-2 gradient-btn text-sm py-3 px-4"
                        >
                          {starting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                          {starting ? "Loading..." : "Start Interview"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
