import { Sun, Moon, Zap, LogOut, LayoutDashboard } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Layout({ children }) {
  const { dark, toggle } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const isHome = location.pathname === "/";
  const isDashboard = location.pathname === "/dashboard";

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="bg-mesh"><div className="orb-3" /></div>
      <div className="bg-noise" />

      <header
        className="sticky top-0 z-50"
        style={{
          background: dark ? "rgba(11, 16, 32, 0.72)" : "rgba(248, 250, 252, 0.78)",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="page-shell h-16 flex items-center justify-between">
          <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2.5 group">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
              style={{
                background: "linear-gradient(135deg, var(--accent-start), var(--accent-end))",
                boxShadow: "0 2px 12px var(--accent-glow)",
              }}
            >
              <Zap size={15} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight" style={{ color: "var(--text-primary)" }}>
              ResumeX
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                {!isDashboard && location.pathname !== "/" && (
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-200"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-card-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    <LayoutDashboard size={13} /> Dashboard
                  </Link>
                )}
                <span
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ color: "var(--text-muted)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
                >
                  {user.name.split(" ")[0]}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-200"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-glow)"; e.currentTarget.style.color = "var(--danger)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  <LogOut size={13} /> Sign out
                </button>
              </>
            ) : (
              <>
                {!isHome && (
                  <Link
                    to="/"
                    className="text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-200"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-card-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    ← New Analysis
                  </Link>
                )}
                <Link
                  to="/login"
                  className="text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-200"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-card-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  Sign in
                </Link>
              </>
            )}

            <button
              onClick={toggle}
              className="relative w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-card-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              aria-label="Toggle theme"
            >
              <div className="transition-transform duration-500" style={{ transform: dark ? "rotate(0deg)" : "rotate(180deg)" }}>
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </div>
            </button>
          </div>
        </div>
      </header>

      <main className="page-shell relative z-10 py-14 sm:py-16 lg:py-18">
        {children}
      </main>
    </div>
  );
}
