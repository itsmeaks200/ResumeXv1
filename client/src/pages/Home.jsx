import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, ArrowRight, X, Loader2 } from "lucide-react";
import { parseResume, analyzeResume } from "../lib/api";

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
      setError("Please upload a resume and paste a job description.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: resume } = await parseResume(file);
      const { data: atsResult } = await analyzeResume(resume, jd);
      navigate("/results", { state: { resume, atsResult, jobDescription: jd } });
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Resume Intelligence</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          Upload your resume and paste a job description to get your ATS score and prep for the interview.
        </p>
      </div>

      {/* Upload zone */}
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors duration-150
          ${dragging
            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30"
            : "border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText size={20} className="text-indigo-500" />
            <span className="text-sm font-medium">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-400 dark:text-zinc-500">
            <Upload size={24} />
            <p className="text-sm">Drop your resume here or <span className="text-indigo-500">browse</span></p>
            <p className="text-xs">PDF or DOCX · Max 5MB</p>
          </div>
        )}
      </div>

      {/* JD input */}
      <div className="mt-6">
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wide">
          Job Description
        </label>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={8}
          placeholder="Paste the full job description here..."
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900
            text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600
            px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        />
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-500">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !file || !jd.trim()}
        className="mt-6 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500
          disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium
          rounded-xl px-6 py-3 transition-colors duration-150"
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" /> Analyzing...</>
        ) : (
          <> Analyze Resume <ArrowRight size={16} /></>
        )}
      </button>
    </div>
  );
}
