import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, ArrowRight, X, Loader2, Sparkles, Target, Mic, BookOpen } from "lucide-react";
import { parseResume, analyzeResume } from "../lib/api";

const features = [
  { icon: Target, label: "ATS Score", desc: "Keyword match & gap analysis" },
  { icon: Mic, label: "Mock Interview", desc: "AI voice interview with feedback" },
  { icon: BookOpen, label: "Study Plan", desc: "Personalized improvement path" },
];

export default function Home() {
  const [file, setFile] = useState(null);
  const [jd, setJd] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();
  const navigate = useNavigate();

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

  const handleSubmit = async () => {
    if (!file || !jd.trim()) {
      setError("Upload a resume and paste a job description.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // parse returns { data: parsedJson, resumeId (if logged in) }
      const { data: parseResult } = await parseResume(file);
      const resume = parseResult.data;
      const resumeId = parseResult.resumeId ?? null;
      const { data: atsResult } = await analyzeResume(resume, jd);
      navigate("/results", { state: { resume, atsResult, jobDescription: jd, resumeId } });
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">

      {/* Hero */}
      <div className="text-center mb-12 fade-in-up stagger-1">
        <div
          className="inline-flex items-center gap-2 text-xs font-medium px-4 py-1.5 rounded-full mb-6"
          style={{
            background: "var(--accent-glow)",
            color: "var(--accent-mid)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
          }}
        >
          <Sparkles size={12} />
          AI-powered resume intelligence
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-4">
          Know your chances.
          <br />
          <span className="gradient-text">Ace the interview.</span>
        </h1>
        <p className="text-base leading-relaxed max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
          Upload your resume and paste a job description to get your ATS score, gap analysis, and a live mock interview.
        </p>
      </div>

      {/* Upload zone */}
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="cursor-pointer glass-card p-8 text-center transition-all duration-300 select-none fade-in-up stagger-2"
        style={{
          borderStyle: file ? "solid" : "dashed",
          borderWidth: "2px",
          borderColor: dragging ? "var(--accent-start)" : file ? "rgba(139, 92, 246, 0.3)" : "var(--border-subtle)",
          boxShadow: dragging ? "0 0 40px var(--accent-glow), inset 0 0 40px rgba(139, 92, 246, 0.05)" : "none",
          transform: dragging ? "scale(1.01)" : "scale(1)",
        }}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />

        {file ? (
          <div className="flex items-center justify-center gap-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background: "var(--accent-glow)", border: "1px solid rgba(139, 92, 246, 0.2)" }}
            >
              <FileText size={18} style={{ color: "var(--accent-mid)" }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{file.name}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{(file.size / 1024).toFixed(0)} KB · Ready to analyze</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="ml-auto p-2 rounded-lg transition-all duration-200"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center float"
              style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border-subtle)" }}
            >
              <Upload size={22} style={{ color: "var(--text-muted)" }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Drop your resume here</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                or <span style={{ color: "var(--accent-mid)" }} className="underline underline-offset-2 cursor-pointer">browse files</span> · PDF or DOCX · max 5MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* JD textarea */}
      <div className="mt-6 fade-in-up stagger-3">
        <label className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
          Job Description
        </label>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={7}
          placeholder="Paste the full job description here..."
          className="w-full glass-input px-5 py-4 text-sm resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="mt-4 flex items-center gap-2 text-sm rounded-xl px-4 py-3 scale-in"
          style={{ background: "var(--danger-glow)", color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.2)" }}
        >
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleSubmit}
        disabled={loading || !file || !jd.trim()}
        className="mt-5 w-full flex items-center justify-center gap-2.5 gradient-btn text-sm py-4 px-6 fade-in-up stagger-4"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Analyzing resume...</>
          : <>Analyze Resume <ArrowRight size={16} /></>
        }
      </button>

      {/* Feature cards */}
      <div className="grid grid-cols-3 gap-3 mt-10">
        {features.map((f, i) => (
          <div
            key={f.label}
            className={`glass-card p-4 text-center fade-in-up stagger-${i + 4}`}
            style={{ borderStyle: "solid" }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ background: "var(--accent-glow)", border: "1px solid rgba(139, 92, 246, 0.15)" }}
            >
              <f.icon size={18} style={{ color: "var(--accent-mid)" }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{f.label}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
