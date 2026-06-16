import { Sun, Moon, Zap } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { Link, useLocation } from "react-router-dom";

export default function Layout({ children }) {
  const { dark, toggle } = useTheme();
  const location = useLocation();

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Animated background mesh */}
      <div className="bg-mesh">
        <div className="orb-3" />
      </div>
      <div className="bg-noise" />

      {/* Glassmorphic navbar */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: dark ? 'rgba(10, 10, 15, 0.7)' : 'rgba(250, 250, 254, 0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--accent-start), var(--accent-end))',
                boxShadow: '0 2px 12px var(--accent-glow)',
              }}
            >
              <Zap size={15} className="text-white" />
            </div>
            <span
              className="font-semibold text-sm tracking-tight transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              ResumeX
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Nav links */}
            {location.pathname !== "/" && (
              <Link
                to="/"
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-card-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                ← New Analysis
              </Link>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-300"
              style={{
                color: 'var(--text-secondary)',
                background: 'transparent',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-card-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              aria-label="Toggle theme"
            >
              <div className="transition-transform duration-500" style={{ transform: dark ? 'rotate(0deg)' : 'rotate(180deg)' }}>
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        {children}
      </main>
    </div>
  );
}
