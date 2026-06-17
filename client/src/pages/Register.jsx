import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import { registerApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await registerApi(name, email, password);
      login(data.token, data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="text-center mb-8 fade-in-up stagger-1">
        <h1 className="text-3xl font-bold tracking-tight">Create account</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Save resumes and track your progress
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="glass-card-static p-8 space-y-5 fade-in-up stagger-2"
        style={{ borderStyle: "solid" }}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Akshat Tripathi"
            required
            className="w-full glass-input px-4 py-3 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full glass-input px-4 py-3 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            required
            minLength={6}
            className="w-full glass-input px-4 py-3 text-sm"
          />
        </div>

        {error && (
          <div
            className="text-sm rounded-xl px-4 py-3"
            style={{
              background: "var(--danger-glow)",
              color: "var(--danger)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 gradient-btn text-sm py-3.5"
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Creating account...</>
          ) : (
            <><UserPlus size={16} /> Create Account</>
          )}
        </button>
      </form>

      <p className="text-center text-sm mt-6 fade-in-up stagger-3" style={{ color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-medium"
          style={{ color: "var(--accent-mid)" }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
