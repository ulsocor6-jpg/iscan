import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";

interface SystemEvent {
  _id?: string;
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

const api = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => r.json());

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function typeColor(type: string) {
  if (type.startsWith("admin.impersonation")) return "#fbbf24";
  if (type.startsWith("admin.")) return "#a78bfa";
  if (type.startsWith("auth.")) return "#60a5fa";
  if (type.startsWith("deposit.")) return "#4ade80";
  if (type.startsWith("withdrawal.")) return "#f87171";
  if (type === "http_request") return "var(--color-text-tertiary)";
  return "var(--color-text-secondary)";
}

// Plain-English guesses for common failure patterns, matched against
// the error message text. Falls back to a generic pointer when nothing
// matches — this is a best-effort hint, not a diagnosis.
function explainError(message: string, stage?: string): string {
  const m = (message || "").toLowerCase();

  if (m.includes("is not a valid enum value")) {
    return "A value being saved doesn't match what the database schema allows. Check the model's `enum` list for the field named in the error, and make sure the code is sending one of those exact values (case matters).";
  }
  if (m.includes("not found")) {
    return "Something the code expected to already exist (a user, wallet, or record) wasn't found in the database. Check that the referenced ID is correct and that the record was created before this step ran.";
  }
  if (m.includes("timeout") || m.includes("etimedout")) {
    return "A request (likely to an RPC provider, database, or external API) took too long to respond. This is often transient — check if it keeps happening before treating it as a code bug.";
  }
  if (m.includes("econnrefused") || m.includes("connect")) {
    return "Couldn't establish a connection to a required service (database, RPC node, or external API). Check that the service is running and reachable, and that the connection URL/credentials are correct.";
  }
  if (m.includes("duplicate key") || m.includes("e11000")) {
    return "An insert tried to create a record that already exists (violates a unique index). Usually safe to ignore if it's an idempotency check working as intended — worth a look if it's unexpected.";
  }
  if (m.includes("validation failed")) {
    return "A document failed schema validation before it could be saved. Check the specific field mentioned in the error against the model's requirements (type, required, enum, etc).";
  }

  return stage
    ? `No specific pattern recognized. Check the ${stage} file in the codebase for what this step was trying to do when it failed.`
    : "No specific pattern recognized — check the surrounding code for what this step was trying to do when it failed.";
}

const FILTERS = [
  { label: "All", value: "" },
  { label: "Admin actions", value: "admin.*" },
  { label: "Logins", value: "auth.*" },
  { label: "Deposits", value: "deposit.*" },
  { label: "Withdrawals", value: "withdrawal.*" },
  { label: "HTTP requests", value: "http_request" },
  { label: "Errors", value: "__errors__" },
];

// System Inspector is scoped to PHP deposits, internal transfers, admin
// actions, logins, and HTTP requests. Blockchain/on-chain events live
// exclusively in Blockchain Inspector — excluded here so the two feeds
// don't overlap.
function isBlockchainEvent(type: string) {
  return type.startsWith("blockchain.");
}

export default function SystemInspector() {
  const [live, setLive] = useState<SystemEvent[]>([]);
  const [history, setHistory] = useState<SystemEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const loadHistory = useCallback(async (type: string) => {
    setLoadingHistory(true);
    const params = new URLSearchParams();
    if (type && type !== "__errors__") params.set("type", type);
    params.set("limit", "150");
    const res = await api(`/api/v1/admin/events?${params.toString()}`);
    if (res.success) {
      setHistory(res.events.filter((e: SystemEvent) => !isBlockchainEvent(e.type)));
    }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    loadHistory(filter);
  }, [filter, loadHistory]);

  useEffect(() => {
    const es = new EventSource("/api/v1/dashboard/stream");
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        if (isBlockchainEvent(parsed.type)) return;
        setLive((prev) => [parsed, ...prev].slice(0, 300));
      } catch {
        // heartbeat / non-JSON, ignore
      }
    };

    return () => {
      es.close();
    };
  }, []);

  const errorCount = [...live, ...history].filter(
    (e) => e.data?.level === "ERROR"
  ).length;

  const feed =
    filter === "__errors__"
      ? live.filter((e) => e.data?.level === "ERROR")
      : filter
      ? live.filter((e) =>
          filter.endsWith("*") ? e.type.startsWith(filter.slice(0, -1)) : e.type === filter
        )
      : live;

  const rows = [...feed, ...history]
    .filter((e) => !isBlockchainEvent(e.type))
    .filter((e) => (filter === "__errors__" ? e.data?.level === "ERROR" : true))
    .slice(0, 300);

  return (
    <DashboardLayout>
      <div style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>🎥 System Inspector</h1>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {errorCount > 0 && (
              <span style={{
                fontSize: "12px", padding: "3px 10px", borderRadius: "99px",
                background: "#7f1d1d", color: "#fca5a5", fontWeight: 700,
              }}>
                ⚠ {errorCount} error{errorCount === 1 ? "" : "s"}
              </span>
            )}
            <span
              style={{
                fontSize: "12px",
                padding: "3px 10px",
                borderRadius: "99px",
                background: connected ? "#14532d" : "#7f1d1d",
                color: connected ? "#4ade80" : "#f87171",
              }}
            >
              {connected ? "● Live" : "○ Reconnecting..."}
            </span>
          </div>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-tertiary)", marginBottom: "16px" }}>
          PHP deposits, internal transfers, logins, and admin actions across ISCAN — live feed on top, history below. On-chain activity is tracked separately in Blockchain Inspector.
        </p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const isErrorsTab = f.value === "__errors__";
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                style={{
                  fontSize: "12px",
                  padding: "6px 12px",
                  borderRadius: "99px",
                  border: isErrorsTab ? "1px solid #7f1d1d" : "1px solid var(--color-border)",
                  background:
                    filter === f.value
                      ? isErrorsTab
                        ? "#7f1d1d"
                        : "var(--color-background-tertiary)"
                      : "transparent",
                  color:
                    filter === f.value
                      ? isErrorsTab
                        ? "#fca5a5"
                        : "var(--color-text-primary)"
                      : isErrorsTab
                      ? "#f87171"
                      : "var(--color-text-tertiary)",
                  cursor: "pointer",
                }}
              >
                {f.label}
                {isErrorsTab ? ` (${errorCount})` : ""}
              </button>
            );
          })}
        </div>

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {loadingHistory && rows.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              Loading event history...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              No events yet for this filter.
            </div>
          ) : (
            <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {rows.map((ev, i) => {
                const key = ev._id || `${ev.timestamp}-${i}`;
                const isError = ev.data?.level === "ERROR";
                const isOpen = expanded === key;

                return (
                  <div key={key}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : key)}
                      style={{
                        padding: "10px 16px",
                        borderBottom: isOpen ? "none" : "1px solid var(--color-border)",
                        borderLeft: isError ? "3px solid #ef4444" : "3px solid transparent",
                        background: isError ? "rgba(239,68,68,0.06)" : "transparent",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: "10px", width: "10px" }}>
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span style={{
                        fontFamily: "monospace",
                        color: isError ? "#f87171" : typeColor(ev.type),
                        minWidth: "180px"
                      }}>
                        {ev.type}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          color: isError ? "#fca5a5" : "var(--color-text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontFamily: ev.type === "http_request" ? "monospace" : "inherit",
                        }}
                      >
                        {ev.data?.method && ev.data?.path
                          ? `${ev.data.method} ${ev.data.path} → ${ev.data.status} (${ev.data.durationMs}ms)`
                          : ev.data?.adminEmail
                          ? `by ${ev.data.adminEmail}${ev.data.targetEmail ? ` → ${ev.data.targetEmail}` : ""}`
                          : ev.data?.email
                          ? ev.data.email
                          : ev.data?.message
                          ? ev.data.message
                          : JSON.stringify(ev.data)}
                      </span>
                      <span style={{ color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                        {timeAgo(ev.timestamp)}
                      </span>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          padding: "14px 16px 16px 38px",
                          borderBottom: "1px solid var(--color-border)",
                          background: isError ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
                          fontSize: "12px",
                        }}
                      >
                        {isError && (
                          <div
                            style={{
                              background: "#1e1015",
                              border: "1px solid #7f1d1d",
                              borderRadius: 8,
                              padding: "10px 12px",
                              marginBottom: 10,
                              color: "#fca5a5",
                            }}
                          >
                            <strong style={{ color: "#f87171" }}>What this might mean: </strong>
                            {explainError(ev.data?.message, ev.type?.split(".")[1])}
                          </div>
                        )}
                        <div style={{ color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                          Full event data:
                        </div>
                        <pre
                          style={{
                            background: "var(--color-background-tertiary)",
                            padding: "10px",
                            borderRadius: 8,
                            overflowX: "auto",
                            color: "var(--color-text-secondary)",
                            margin: 0,
                          }}
                        >
                          {JSON.stringify(ev.data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
