import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, Trash2, ArrowRight, Clock, Loader2, Calendar,
  Upload, X, ChevronDown, ChevronUp, Target, Mic,
} from "lucide-react";
import { listResumes, getResume, deleteResume, analyzeResume, parseResume } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const DURATIONS = [
  { label: "15 min", minutes: 15, desc: "Quick screen" },
  { label: "30 min", minutes: 30, desc: "Standard" },
  { label: "1 hour", minutes: 60, desc: "Full loop" },
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Inline upload zone ─────────────────────────────────────────────────
function UploadZone({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx", "doc"].includes(ext)) {
      setError("Only PDF or DOCX files are supported.");
      return;
    }
    setError("");
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { data: result } = await parseResume(file);
      setFile(null);
      onUploaded({ resumeId: result.resumeId, filename: file.name });
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="glass-card-static p-5 fade-in-up stagger-2" style={{ borderStyle: "dashed" }}>
      {!file ? (
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="flex items-center gap-4 cursor-pointer"
          style={{
            transition: "opacity 0.2s",
            opacity: dragging ? 0.7 : 1,
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 float"
            style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-subtle)" }}
          >
            <Upload size={18} style={{ color: "var(--text-muted)" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {dragging ? "Drop it here" : "Upload a resume"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              PDF or DOCX · No job description needed yet
            </p>
          </div>
          <span className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ color: "var(--accent-mid)", background: "var(--accent-glow)", border: "1px solid rgba(139,92,246,0.2)" }}>
            Browse
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-glow)", border: "1px solid rgba(139,92,246,0.2)" }}
          >
            <FileText size={18} style={{ color: "var(--accent-mid)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{file.name}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            onClick={() => { setFile(null); setError(""); }}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <X size={14} />
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-2 gradient-btn text-sm px-4 py-2"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Parsing..." : "Upload"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs mt-3 px-1" style={{ color: "var(--danger)" }}>{error}</p>
      )}

      <input ref={inputRef} type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
    </div>
  );
}

// ── Resume action panel (ATS or Interview) ─────────────────────────────
function ActionPanel({ resumeId, mode, onClose, onAnalyzeDone, onInterviewStart }) {
  const navigate = useNavigate();
  const [jd, setJd] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[1]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleATS = async () => {
    if (!jd.trim()) { setError("Paste a job description first."); return; }
    setLoading(true);
    setError("");
    try {
      const [resumeDoc, atsRes] = await Promise.all([
        getResume(resumeId),
        analyzeResume(null, jd, resumeId),
      ]);
      navigate("/results", {
        state: {
          atsResult: atsRes.data,
          resume: resumeDoc.data.parsedData,
          jobDescription: jd,
          resumeId,
        },
      });
    } catch (err) {
      setError(err.response?.data?.error || "Analysis failed.");
      setLoading(false);
    }
  };

  const handleInterview = async () => {
    setLoading(true);
    setError("");
    try {
      const resumeDoc = await getResume(resumeId);
      navigate("/interview", {
        state: {
          resume: resumeDoc.data.parsedData,
          jobDescription: jd,
          duration: selectedDuration.minutes,
        },
      });
    } catch {
      setError("Failed to load resume.");
      setLoading(false);
    }
  };

  return (
    <div className="px-5 pb-5 pt-3 space-y-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      {mode === "ats" && (
        <>
          <div>
            <label className="text-xs font-medium uppercase tracking-widest block mb-2" style={{ color: "var(--text-muted)" }}>
              Job Description
            </label>
            <textarea
              value={jd}
              onChange={(e) => { setJd(e.target.value); setError(""); }}
              rows={5}
              placeholder="Paste the job description to match against this resume..."
              className="w-full glass-input px-4 py-3 text-sm resize-none"
              autoFocus
            />
          </div>
          {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-xl" style={{ color: "var(--text-muted)" }}>Cancel</button>
            <button onClick={handleATS} disabled={loading} className="flex items-center gap-2 gradient-btn text-sm px-5 py-2.5">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
              {loading ? "Analyzing..." : "Get ATS Score"}
            </button>
          </div>
        </>
      )}

      {mode === "interview" && (
        <>
          <div>
            <label className="text-xs font-medium uppercase tracking-widest block mb-2" style={{ color: "var(--text-muted)" }}>
              Job Description <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={3}
              placeholder="Paste a JD to tailor questions to the role (optional)..."
              className="w-full glass-input px-4 py-3 text-sm resize-none"
              autoFocus
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={12} style={{ color: "var(--text-muted)" }} />
              <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Duration</span>
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
                      background: active ? "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.15))" : "var(--bg-card-hover)",
                      border: active ? "1px solid rgba(139,92,246,0.4)" : "1px solid var(--border-subtle)",
                    }}
                  >
                    <span className="text-sm font-bold" style={{ color: active ? "var(--accent-mid)" : "var(--text-primary)" }}>{d.label}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-xl" style={{ color: "var(--text-muted)" }}>Cancel</button>
            <button onClick={handleInterview} disabled={loading} className="flex items-center gap-2 gradient-btn text-sm px-5 py-2.5">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
              {loading ? "Loading..." : "Start Interview"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedMode, setExpandedMode] = useState(null); // "ats" | "interview"
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    listResumes()
      .then((r) => setResumes(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openPanel(resumeId, mode) {
    if (expandedId === resumeId && expandedMode === mode) {
      setExpandedId(null);
      setExpandedMode(null);
    } else {
      setExpandedId(resumeId);
      setExpandedMode(mode);
    }
    setDeleteConfirm(null);
  }

  function closePanel() {
    setExpandedId(null);
    setExpandedMode(null);
  }

  async function handleDelete(id) {
    try {
      await deleteResume(id);
      setResumes((prev) => prev.filter((r) => r._id !== id));
      if (expandedId === id) closePanel();
      setDeleteConfirm(null);
    } catch { /* ignore */ }
  }

  function handleUploaded({ filename }) {
    // Refresh list
    listResumes().then((r) => setResumes(r.data));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="fade-in-up stagger-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {user?.name ? `Hi ${user.name.split(" ")[0]}` : "My Workspace"}
        </h1>
        <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>
          Upload resumes, add job descriptions when ready, then analyze or interview.
        </p>
      </div>

      {/* Upload zone */}
      <UploadZone onUploaded={handleUploaded} />

      {/* Resume library */}
      <div className="space-y-3">
        <div className="flex items-center justify-between fade-in-up stagger-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Saved Resumes {resumes.length > 0 && `(${resumes.length})`}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : resumes.length === 0 ? (
          <div
            className="glass-card-static p-10 text-center fade-in-up stagger-4"
            style={{ borderStyle: "dashed" }}
          >
            <FileText size={20} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No resumes yet — upload one above</p>
          </div>
        ) : (
          resumes.map((resume, idx) => {
            const isExpanded = expandedId === resume._id;
            return (
              <div
                key={resume._id}
                className={`glass-card-static overflow-hidden transition-all duration-300 fade-in-up stagger-${Math.min(idx + 4, 6)}`}
                style={{
                  borderStyle: "solid",
                  borderColor: isExpanded ? "rgba(139,92,246,0.35)" : "var(--border-subtle)",
                  boxShadow: isExpanded ? "0 0 24px var(--accent-glow)" : "none",
                }}
              >
                {/* Resume row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-subtle)" }}
                  >
                    <FileText size={15} style={{ color: "var(--text-muted)" }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {resume.filename}
                    </p>
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "var(--text-muted)" }}>
                      <Calendar size={10} /> {formatDate(resume.createdAt)}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openPanel(resume._id, "ats")}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
                      style={{
                        background: isExpanded && expandedMode === "ats" ? "var(--accent-glow)" : "var(--bg-card-hover)",
                        color: isExpanded && expandedMode === "ats" ? "var(--accent-mid)" : "var(--text-secondary)",
                        border: `1px solid ${isExpanded && expandedMode === "ats" ? "rgba(139,92,246,0.3)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <Target size={12} /> ATS
                    </button>
                    <button
                      onClick={() => openPanel(resume._id, "interview")}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
                      style={{
                        background: isExpanded && expandedMode === "interview" ? "var(--accent-glow)" : "var(--bg-card-hover)",
                        color: isExpanded && expandedMode === "interview" ? "var(--accent-mid)" : "var(--text-secondary)",
                        border: `1px solid ${isExpanded && expandedMode === "interview" ? "rgba(139,92,246,0.3)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <Mic size={12} /> Interview
                    </button>

                    {deleteConfirm === resume._id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDelete(resume._id)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ background: "var(--danger-glow)", color: "var(--danger)" }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ color: "var(--text-muted)" }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(resume._id)}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-glow)"; e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    <div style={{ color: "var(--text-muted)" }}>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </div>
                </div>

                {/* Action panel */}
                {isExpanded && (
                  <ActionPanel
                    resumeId={resume._id}
                    mode={expandedMode}
                    onClose={closePanel}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
