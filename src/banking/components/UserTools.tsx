import { useState, useEffect, useMemo } from "react";
import "./UserTools.css";

interface FlowStage {
  name: string;
  status: string;
  error?: string | null;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
}

interface TxItem {
  id: string;
  referenceId?: string;
  orderId?: string;
  flowId?: string;
  type?: string;
  _kind: string;
  amount: number;
  currency: string;
  source?: string;
  network?: string;
  destination?: string;
  status: string;
  createdAt: string;
  failureReason?: string | null;
  txHash?: string | null;
  currentStage?: string;
  pipeline?: string;
  stages?: FlowStage[];
  canRetry?: boolean;
  canCancel?: boolean;
  link?: string;
}

interface DashboardData {
  summary: {
    totalDeposits: number; failedDeposits: number; pendingDeposits: number;
    totalWithdrawals: number; failedWithdrawals: number; pendingWithdrawals: number;
    totalSwaps: number; failedSwaps: number; stuckFlows: number; healthScore: number;
  };
  deposits: any[];
  withdrawals: any[];
  swaps: any[];
  stuckFlows: any[];
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#4ade80", settled: "#4ade80", success: "#4ade80",
  SUCCESS: "#4ade80", COMPLETED: "#4ade80", RUNNING: "#60a5fa",
  running: "#60a5fa", processing: "#60a5fa", pending: "#fbbf24",
  pending_review: "#fbbf24", PENDING: "#fbbf24", failed: "#ef4444",
  FAILED: "#ef4444", cancelled: "#6b7280", CANCELLED: "#6b7280",
  expired: "#6b7280", SKIPPED: "#6b7280",
};

const TYPE_ICONS: Record<string, string> = {
  deposit: "💰", withdrawal: "💸", swap: "🔄", flow: "🔍"
};

export default function UserTools() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "failed" | "pending" | "completed">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadDashboard();
  }, [open]);

  useEffect(() => {
    if (actionFeedback) {
      const t = setTimeout(() => setActionFeedback(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionFeedback]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/user/tools/dashboard", { credentials: "include" });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || "Failed to load");
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleAction(action: string, item: TxItem) {
    const fid = item.flowId || item.referenceId || item.orderId || item.id;
    try {
      const res = await fetch(`/api/v1/user/tools/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flowId: fid }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`✅ ${action} successful`);
        loadDashboard();
      } else {
        setActionFeedback(`❌ ${json.error}`);
      }
    } catch (e: any) {
      setActionFeedback(`❌ ${e.message}`);
    }
  }

  function dismiss(id: string) {
    setDismissedIds(prev => new Set([...prev, id]));
  }

  // Build unified item list from all categories
  const allItems: TxItem[] = useMemo(() => {
    if (!data) return [];
    return [
      ...data.deposits.map((d: any) => ({ ...d, _kind: "deposit" })),
      ...data.withdrawals.map((w: any) => ({ ...w, _kind: "withdrawal" })),
      ...data.swaps.map((s: any) => ({ ...s, _kind: "swap" })),
      ...data.stuckFlows.map((f: any) => ({ ...f, _kind: "flow" })),
    ].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  // Filter + search
  const filteredItems = useMemo(() => {
    let items = allItems.filter(item => !dismissedIds.has(item.flowId || item.orderId || item.referenceId || item.id || ""));
    
    // Status filter
    if (filter === "failed") items = items.filter(i => i.status === "failed" || i.status === "FAILED");
    else if (filter === "pending") items = items.filter(i => i.status === "pending" || i.status === "pending_review" || i.status === "PENDING" || i.status === "RUNNING" || i.status === "processing");
    else if (filter === "completed") items = items.filter(i => i.status === "completed" || i.status === "settled" || i.status === "SUCCESS" || i.status === "COMPLETED");

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        (i.referenceId || "").toLowerCase().includes(q) ||
        (i.orderId || "").toLowerCase().includes(q) ||
        (i.flowId || "").toLowerCase().includes(q) ||
        (i._kind || "").toLowerCase().includes(q) ||
        (i.status || "").toLowerCase().includes(q) ||
        (i.source || "").toLowerCase().includes(q) ||
        (i.pipeline || "").toLowerCase().includes(q) ||
        String(i.amount).includes(q)
      );
    }

    return items;
  }, [allItems, filter, search, dismissedIds]);

  function timeAgo(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }

  function formatPHP(n: number) { return "₱" + (n || 0).toLocaleString(); }

  function getHealthColor(score: number) {
    if (score >= 90) return "#4ade80";
    if (score >= 70) return "#fbbf24";
    return "#ef4444";
  }

  const visibleCount = allItems.length - dismissedIds.size;

  return (
    <div className="user-tools">
      {open && (
        <div className="user-tools-panel" role="dialog" aria-label="Transaction Health" style={{ width: 500, maxHeight: "85vh" }}>
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="user-tools-header">
            <div>
              <div className="user-tools-title">🔧 Transactions</div>
              {data && (
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  Health:{" "}
                  <span style={{ color: getHealthColor(data.summary.healthScore), fontWeight: 700 }}>
                    {data.summary.healthScore}%
                  </span>
                  <span style={{ color: "#6b7280", marginLeft: 8 }}>
                    {visibleCount} of {allItems.length} shown
                  </span>
                </div>
              )}
            </div>
            <button className="user-tools-close" onClick={() => setOpen(false)}>×</button>
          </div>

          {/* ── Summary bar ────────────────────────────────────────── */}
          {data && (
            <div style={{ display: "flex", gap: 4, padding: "6px 12px", flexWrap: "wrap" }}>
              {[
                { l: "Deposits", t: data.summary.totalDeposits, f: data.summary.failedDeposits },
                { l: "Withdrawals", t: data.summary.totalWithdrawals, f: data.summary.failedWithdrawals },
                { l: "Swaps", t: data.summary.totalSwaps, f: data.summary.failedSwaps },
                { l: "Stuck", t: data.summary.stuckFlows, f: data.summary.stuckFlows },
              ].map(c => (
                <div key={c.l} style={{
                  background: c.f > 0 ? "#450a0a" : "#0d1117", borderRadius: 4,
                  padding: "3px 8px", fontSize: 9, border: c.f > 0 ? "1px solid #7f1d1d" : "1px solid #1f2937",
                }}>
                  <span style={{ color: "#6b7280" }}>{c.l} </span>
                  <span style={{ color: "#e5e7eb", fontWeight: 700 }}>{c.t}</span>
                  {c.f > 0 && <span style={{ color: "#ef4444", marginLeft: 3 }}>({c.f}⚠)</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Search + filter ────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: "1px solid #1f2937" }}>
            <input
              type="text"
              placeholder="Search by ref, amount, type, status..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, background: "#0d1117", border: "1px solid #1f2937", borderRadius: 4,
                padding: "5px 10px", color: "#e5e7eb", fontSize: 11, outline: "none",
              }}
            />
            {(["all", "failed", "pending", "completed"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "4px 8px", borderRadius: 4, border: "none", fontSize: 9, fontWeight: 700, cursor: "pointer",
                background: filter === f ? "#00d4aa" : "#1f2937",
                color: filter === f ? "#000" : "#9ca3af", textTransform: "uppercase",
              }}>
                {f}
              </button>
            ))}
          </div>

          {/* ── Items ──────────────────────────────────────────────── */}
          <div style={{ overflowY: "auto", maxHeight: 420, padding: "8px 12px" }}>
            {loading && <div style={{ color: "#6b7280", fontSize: 11, textAlign: "center", padding: 20 }}>⏳ Loading...</div>}
            {error && <div style={{ color: "#ef4444", fontSize: 11, textAlign: "center", padding: 20 }}>{error}</div>}
            {actionFeedback && (
              <div style={{
                background: actionFeedback.startsWith("✅") ? "#064e3b" : "#450a0a",
                color: actionFeedback.startsWith("✅") ? "#4ade80" : "#fca5a5",
                fontSize: 10, padding: "6px 10px", borderRadius: 4, marginBottom: 8, textAlign: "center",
              }}>
                {actionFeedback}
              </div>
            )}

            {!loading && !error && filteredItems.length === 0 && (
              <div style={{ color: "#6b7280", fontSize: 11, textAlign: "center", padding: 30 }}>
                {search ? "No results match your search" : "All clear — no transactions to show"}
              </div>
            )}

            {filteredItems.map((item, i) => {
              const uid = item.flowId || item.orderId || item.referenceId || item.id || String(i);
              const isExpanded = expandedId === uid;
              const stages = item.stages || [];
              const isFailed = item.status === "failed" || item.status === "FAILED";

              return (
                <div key={uid} style={{
                  background: "#0d1117", borderRadius: 6, padding: 6, marginBottom: 6,
                  border: isFailed ? "1px solid #450a0a" : "1px solid #1f2937",

                }}>
                  {/* ── Main row ────────────────────────────────────── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Expand toggle */}
                    <span onClick={() => setExpandedId(isExpanded ? null : uid)} style={{
                      cursor: "pointer", fontSize: 12, color: "#6b7280", userSelect: "none", minWidth: 16,
                    }}>
                      {isExpanded ? "▼" : "▶"}
                    </span>

                    {/* Type icon */}
                    <span style={{ fontSize: 14 }}>{TYPE_ICONS[item._kind] || "📌"}</span>

                    {/* Info */}
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : uid)}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#e5e7eb" }}>
                        {item._kind === "deposit" && `${item.source || "Deposit"}`}
                        {item._kind === "withdrawal" ? `→ ${item.network || item.currency || ""} ${item.destination ? "to " + item.destination : ""}` : ""}
                        {item._kind === "swap" && `${item.direction || "Swap"}`}
                        {item._kind === "flow" && `${item.pipeline || "Flow"}`}
                      </div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>
                        {item.currency === "PHP" || !item.currency ? formatPHP(item.amount) : `${item.amount} ${item.currency}`}
                        {" · "}{timeAgo(item.createdAt)}
                        {" · "}{uid.slice(-8)}
                      </div>
                    </div>

                    {/* Status */}
                    <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLORS[item.status] || "#6b7280" }}>
                      ● {item.status}
                    </span>

                    {/* Dismiss */}
                    <span onClick={(e) => { e.stopPropagation(); dismiss(uid); }} style={{
                      cursor: "pointer", color: "#6b7280", fontSize: 14, padding: "0 4px",
                    }} title="Dismiss">✕</span>
                  </div>

                  {/* ── Expanded detail ─────────────────────────────── */}
                  {isExpanded && (
                    <div style={{ marginTop: 6, padding: "6px 8px", background: "#0a0e14", borderRadius: 4 }}>
                      {/* Stages */}
                      {stages.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 3, textTransform: "uppercase" }}>Pipeline Stages</div>
                          {stages.map((s: FlowStage, j: number) => (
                            <div key={j} style={{
                              display: "flex", justifyContent: "space-between", padding: "2px 4px",
                              fontSize: 9, borderRadius: 2, marginBottom: 1,
                              background: s.status === "FAILED" ? "#450a0a" : "transparent",
                            }}>
                              <span style={{ color: s.status === "FAILED" ? "#fca5a5" : "#9ca3af" }}>{j + 1}. {s.name}</span>
                              <span style={{ color: STATUS_COLORS[s.status] || "#6b7280", fontWeight: 600 }}>{s.status}</span>
                              {s.durationMs ? <span style={{ color: "#6b7280" }}>{s.durationMs}ms</span> : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Credit status for swaps */}
                      {item._kind === "swap" && (item as any).credited !== undefined && (
                        <div style={{
                          background: (item as any).credited ? "#064e3b" : "#450a0a",
                          color: (item as any).credited ? "#4ade80" : "#fca5a5",
                          fontSize: 10, padding: "6px 8px", borderRadius: 4, marginBottom: 6,
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <span>
                            {(item as any).credited 
                              ? `✅ Credited: ${(item as any).creditAmount || item.amount} ${item.currency}`
                              : item.failureReason || "❌ Not credited — funds may be stuck"}
                          </span>
                          {!(item as any).credited && (
                            <button onClick={() => handleAction("retry", item)} style={{
                              padding: "3px 8px", borderRadius: 4, border: "none", fontSize: 9, fontWeight: 700,
                              cursor: "pointer", background: "#dc2626", color: "#fff",
                            }}>
                              Retry Credit
                            </button>
                          )}
                        </div>
                      )}

                      {/* Error */}
                      {(item.failureReason || stages.some(s => s.error)) && (
                        <div style={{ background: "#450a0a", color: "#fca5a5", fontSize: 9, padding: "4px 6px", borderRadius: 3, marginBottom: 6 }}>
                          {item.failureReason || stages.find(s => s.error)?.error}
                        </div>
                      )}

                      {/* TX hash */}
                      {item.txHash && (
                        <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>
                          TX: <span style={{ color: "#00d4aa", fontFamily: "monospace" }}>{item.txHash.slice(0, 12)}...{item.txHash.slice(-6)}</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6 }}>
                        {(item.canRetry || isFailed) && (
                          <button onClick={() => handleAction("retry", item)} style={{
                            padding: "3px 10px", borderRadius: 4, border: "none", fontSize: 9, fontWeight: 700, cursor: "pointer",
                            background: "#2563eb", color: "#fff",
                          }}>↻ Retry</button>
                        )}
                        {(item.canCancel || item.status === "RUNNING" || item.status === "running" || item.status === "processing") && (
                          <button onClick={() => handleAction("cancel", item)} style={{
                            padding: "3px 10px", borderRadius: 4, border: "none", fontSize: 9, fontWeight: 700, cursor: "pointer",
                            background: "#6b7280", color: "#fff",
                          }}>✕ Cancel</button>
                        )}
                        <button onClick={() => dismiss(uid)} style={{
                          padding: "3px 10px", borderRadius: 4, border: "none", fontSize: 9, fontWeight: 700, cursor: "pointer",
                          background: "#1f2937", color: "#9ca3af",
                        }}>👁 Hide</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <div style={{ padding: "6px 12px", borderTop: "1px solid #1f2937", display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button onClick={() => { setDismissedIds(new Set()); setSearch(""); setFilter("all"); }} style={{
              padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 9, cursor: "pointer",
              background: "#1f2937", color: "#9ca3af",
            }}>
              Show all
            </button>
            <button onClick={loadDashboard} style={{
              padding: "4px 16px", borderRadius: 4, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
              background: "#00d4aa", color: "#000",
            }}>
              🔄 Refresh
            </button>
          </div>
        </div>
      )}

      <button className="user-tools-toggle" onClick={() => setOpen(o => !o)}>
        {open ? "×" : "🛠"}
      </button>
    </div>
  );
}
