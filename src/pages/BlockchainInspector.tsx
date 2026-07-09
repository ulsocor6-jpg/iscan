import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";

interface ChainEvent {
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

function shortHash(hash?: string) {
  if (!hash) return "";
  return hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;
}

function shortAddr(addr?: string) {
  if (!addr) return "";
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

const CATEGORY_COLOR: Record<string, string> = {
  deposit: "#4ade80",
  withdrawal: "#f87171",
  scan: "#22d3ee",
  system: "#a78bfa",
  other: "var(--color-text-tertiary)",
};

const TABS = [
  { label: "All", value: "" },
  { label: "Deposits", value: "deposit" },
  { label: "Withdrawals", value: "withdrawal" },
  { label: "Chain Scans", value: "scan" },
  { label: "System / Recovery", value: "system" },
  { label: "Errors", value: "__errors__" },
];

export default function BlockchainInspector() {
  const [live, setLive] = useState<ChainEvent[]>([]);
  const [history, setHistory] = useState<ChainEvent[]>([]);
  const [tab, setTab] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const res = await api(`/api/v1/admin/events?type=blockchain.*&limit=300`);
    if (res.success) setHistory(res.events);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const es = new EventSource("/api/v1/dashboard/stream");
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        if (parsed.type?.startsWith("blockchain.")) {
          setLive((prev) => [parsed, ...prev].slice(0, 300));
        }
      } catch {
        // heartbeat, ignore
      }
    };
    return () => es.close();
  }, []);

  const merged = [...live, ...history].slice(0, 300);

  const errorCount = merged.filter((e) => e.data?.level === "ERROR").length;

  const rows = tab
    ? tab === "__errors__"
      ? merged.filter((e) => e.data?.level === "ERROR")
      : merged.filter((e) => (e.data?.category || "other") === tab)
    : merged;

  const counts: Record<string, number> = {};
  merged.forEach((e) => {
    const c = e.data?.category || "other";
    counts[c] = (counts[c] || 0) + 1;
  });

  return (
    <DashboardLayout>
      <div style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>⛓️ Blockchain Inspector</h1>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {errorCount > 0 && (
              <span style={{
                fontSize: "12px", padding: "3px 10px", borderRadius: "99px",
                background: "#7f1d1d", color: "#fca5a5", fontWeight: 700,
              }}>
                ⚠ {errorCount} error{errorCount === 1 ? "" : "s"}
              </span>
            )}
            <span style={{
              fontSize: "12px", padding: "3px 10px", borderRadius: "99px",
              background: connected ? "#14532d" : "#7f1d1d",
              color: connected ? "#4ade80" : "#f87171",
            }}>
              {connected ? "● Live" : "○ Reconnecting..."}
            </span>
          </div>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-tertiary)", marginBottom: "16px" }}>
          On-chain deposits, withdrawals, scans, and recovery jobs across Base and Ronin — split from the general System Inspector feed.
        </p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const isErrorsTab = t.value === "__errors__";
            const count = isErrorsTab
              ? errorCount
              : t.value
              ? counts[t.value] || 0
              : merged.length;
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                style={{
                  fontSize: "12px", padding: "6px 12px", borderRadius: "99px",
                  border: isErrorsTab
                    ? "1px solid #7f1d1d"
                    : "1px solid var(--color-border)",
                  background: active
                    ? (isErrorsTab ? "#7f1d1d" : "var(--color-background-tertiary)")
                    : "transparent",
                  color: active
                    ? (isErrorsTab ? "#fca5a5" : "var(--color-text-primary)")
                    : (isErrorsTab ? "#f87171" : "var(--color-text-tertiary)"),
                  cursor: "pointer",
                }}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ border: "1px solid var(--color-border)", borderRadius: "12px", overflow: "hidden" }}>
          {loadingHistory && rows.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              Loading blockchain event history...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              No events yet for this filter.
            </div>
          ) : (
            <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {rows.map((ev, i) => {
                const category = ev.data?.category || "other";
                const level = ev.data?.level || "INFO";
                const isError = level === "ERROR";
                const isWarning = level === "WARNING";
                const d = ev.data || {};

                // Build a rich detail line from whatever metadata is present,
                // instead of relying purely on the raw message string.
                const details: string[] = [];
                if (d.amount && d.token) details.push(`${d.amount} ${d.token}`);
                if (d.chain) details.push(d.chain.toUpperCase());
                if (d.to) details.push(`→ ${shortAddr(d.to)}`);
                if (d.txHash) details.push(shortHash(d.txHash));

                return (
                  <div
                    key={ev._id || `${ev.timestamp}-${i}`}
                    style={{
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--color-border)",
                      borderLeft: isError
                        ? "3px solid #ef4444"
                        : isWarning
                        ? "3px solid #facc15"
                        : "3px solid transparent",
                      background: isError ? "rgba(239,68,68,0.06)" : "transparent",
                      fontSize: "12px", display: "flex", alignItems: "center", gap: "12px",
                    }}
                  >
                    <span style={{
                      fontFamily: "monospace",
                      color: isError ? "#f87171" : CATEGORY_COLOR[category],
                      minWidth: "90px",
                      textTransform: "uppercase", fontSize: "10px", fontWeight: 700,
                    }}>
                      {isError ? "ERROR" : category}
                    </span>
                    <span style={{ fontFamily: "monospace", color: "var(--color-text-tertiary)", minWidth: "160px" }}>
                      {ev.type.replace("blockchain.", "")}
                    </span>
                    <span style={{
                      flex: 1,
                      color: isError ? "#fca5a5" : "var(--color-text-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {d.message}
                      {details.length > 0 && (
                        <span style={{ color: "var(--color-text-tertiary)", marginLeft: 8 }}>
                          {details.join(" · ")}
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                      {timeAgo(ev.timestamp)}
                    </span>
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
