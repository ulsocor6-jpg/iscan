// src/banking/components/Header.tsx  (replace existing file)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";
import FlowerTicker from "./dashboard/FlowerTicker";
import BackgroundPicker from "./BackgroundPicker";
import { useAdminAlerts } from "../../hooks/useAdminAlerts";
import type { AdminAlert } from "../../hooks/useAdminAlerts";

// ── Toast stack ──────────────────────────────────────────────────────────────
function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: AdminAlert[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            pointerEvents: "all",
            background:
              t.type === "deposit"
                ? "linear-gradient(135deg,#052e16,#0d1526)"
                : "linear-gradient(135deg,#1c1917,#0d1526)",
            border: `1px solid ${t.type === "deposit" ? "#16a34a" : "#b45309"}`,
            borderRadius: 12,
            padding: "14px 18px",
            minWidth: 280,
            maxWidth: 340,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            animation: "slideInToast 0.3s ease",
          }}
        >
          {/* Icon */}
          <div
            style={{
              fontSize: 22,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {t.type === "deposit" ? "💰" : "🏧"}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: t.type === "deposit" ? "#22c55e" : "#f59e0b",
                marginBottom: 3,
              }}
            >
              {t.title}
            </div>
            <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
              {t.body}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#64748b",
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.user}
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => onDismiss(t.id)}
            style={{
              background: "none",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Keyframe injected once */}
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ── Notification bell + dropdown ─────────────────────────────────────────────
function NotificationBell({
  alerts,
  unread,
  onMarkAllRead,
}: {
  alerts: AdminAlert[];
  unread: number;
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function handleBellClick() {
    setOpen((o) => !o);
    if (!open) onMarkAllRead();
  }

  function goTo(type: "deposit" | "withdrawal") {
    setOpen(false);
    navigate(type === "deposit" ? "/deposits" : "/admin/cashouts");
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={handleBellClick}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 20,
          padding: "6px 8px",
          borderRadius: 8,
          transition: "background 0.15s",
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              background: "#ef4444",
              color: "white",
              borderRadius: "99px",
              fontSize: 9,
              fontWeight: 800,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              lineHeight: 1,
              boxShadow: "0 0 0 2px #0d1526",
              animation: "pulse 1.5s infinite",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            background: "#0d1526",
            border: "1px solid #1d2942",
            borderRadius: 14,
            width: 340,
            zIndex: 999,
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #1d2942",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
              Alerts
            </span>
            {alerts.length > 0 && (
              <button
                onClick={onMarkAllRead}
                style={{
                  background: "none",
                  border: "none",
                  color: "#3b82f6",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {alerts.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#475569",
                  fontSize: 13,
                }}
              >
                No pending alerts
              </div>
            ) : (
              alerts.slice(0, 20).map((a) => (
                <div
                  key={a.id}
                  onClick={() => goTo(a.type)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #1d2942",
                    cursor: "pointer",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    background: a.read ? "transparent" : "rgba(59,130,246,0.05)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLDivElement).style.background =
                      "#121b2f")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLDivElement).style.background = a.read
                      ? "transparent"
                      : "rgba(59,130,246,0.05)")
                  }
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>
                    {a.type === "deposit" ? "💰" : "🏧"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color:
                          a.type === "deposit" ? "#22c55e" : "#f59e0b",
                        marginBottom: 2,
                      }}
                    >
                      {a.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#e2e8f0",
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      {a.body}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#475569",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.user} ·{" "}
                      {new Date(a.createdAt).toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  {!a.read && (
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#3b82f6",
                        flexShrink: 0,
                        marginTop: 4,
                      }}
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {alerts.length > 0 && (
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid #1d2942",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                onClick={() => goTo("deposit")}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 8,
                  border: "1px solid #16a34a",
                  background: "transparent",
                  color: "#22c55e",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                💰 View Deposits
              </button>
              <button
                onClick={() => goTo("withdrawal")}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 8,
                  border: "1px solid #b45309",
                  background: "transparent",
                  color: "#f59e0b",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🏧 View Cashouts
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 2px #0d1526, 0 0 0 4px rgba(239,68,68,0.3); }
          50%       { box-shadow: 0 0 0 2px #0d1526, 0 0 0 6px rgba(239,68,68,0.0); }
        }
      `}</style>
    </div>
  );
}

// ── Main Header ───────────────────────────────────────────────────────────────
export default function Header() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "admin";
  const { alerts, toasts, unread, markAllRead, dismissToast } =
    useAdminAlerts(isAdmin);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <>
      <header className="header">
        <div className="search">
          <input
            type="text"
            placeholder="Search users, wallets, tx hash..."
          />
        </div>

        <div className="header-actions">
          {/* Bell — shows live badge only for admins */}
          {isAdmin ? (
            <NotificationBell
              alerts={alerts}
              unread={unread}
              onMarkAllRead={markAllRead}
            />
          ) : (
            <button>🔔</button>
          )}

          <button>⚙️</button>
          <BackgroundPicker />
          <FlowerTicker />

          {/* User menu */}
          <div ref={ref} style={{ position: "relative" }}>
            <div
              onClick={() => setOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#121b2f",
                border: "1px solid #1d2942",
                padding: "8px 14px",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#3b82f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {user?.firstName?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {user?.firstName ?? "User"}
                </span>
              </div>
            </div>

            {open && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "110%",
                  background: "#121b2f",
                  border: "1px solid #1d2942",
                  borderRadius: 12,
                  minWidth: 180,
                  zIndex: 50,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate("/profile");
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  👤 Profile / Accounts
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                  }}
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Toast stack — rendered outside header so it floats above everything */}
      {isAdmin && (
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      )}
    </>
  );
}
