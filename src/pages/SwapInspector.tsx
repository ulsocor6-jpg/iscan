import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";

const api = (url: string, opts: any = {}) =>
  fetch(url, { credentials: "include", ...opts }).then((r) => r.json());

const STAGES = ["DEPOSIT", "SWEEP", "SWAP", "SETTLE"];

const STAGE_FOR_STATUS: Record<string, string> = {
  WAITING_DEPOSIT: "DEPOSIT",
  CREATED: "DEPOSIT",
  DEPOSIT_RECEIVED: "SWEEP",
  FAILED_SWEEP: "SWEEP",
  VERIFIED: "SWAP",
  SWAPPING: "SWAP",
  FAILED_SWAP: "SWAP",
  SWAPPED: "SETTLE",
  SETTLING: "SETTLE",
  FAILED_SETTLE: "SETTLE",
  COMPLETED: "SETTLE",
  FAILED: "SETTLE",
};

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

function shortAddr(addr?: string) {
  if (!addr) return "";
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function stageStatusFor(order: any, stage: string) {
  const currentIndex = STAGES.indexOf(STAGE_FOR_STATUS[order.status] || "DEPOSIT");
  const stageIndex = STAGES.indexOf(stage);
  const isFailed = order.status.startsWith("FAILED");

  if (isFailed && stageIndex === currentIndex) return "failed";
  if (order.status === "COMPLETED") return "done";
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex && !isFailed) return "active";
  return "pending";
}

const TABS = [
  { label: "All", value: "" },
  { label: "Needs attention", value: "__failed__" },
  { label: "In progress", value: "__active__" },
  { label: "Completed", value: "COMPLETED" },
];

export default function SwapInspector() {
  const [orders, setOrders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [tab, setTab] = useState("__failed__");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api("/api/v1/admin/flower-orders");
    if (res.success) setOrders(res.orders);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const retry = async (orderId: string) => {
    setRetrying(orderId);
    const res = await api(`/api/v1/admin/flower-orders/${orderId}/retry`, { method: "POST" });
    setRetrying(null);
    if (res.success) load();
    else alert(res.error);
  };

  const failedCount = orders.filter((o) => o.status.startsWith("FAILED")).length;
  const activeCount = orders.filter(
    (o) => !o.status.startsWith("FAILED") && o.status !== "COMPLETED"
  ).length;

  const counts: Record<string, number> = {
    "": orders.length,
    __failed__: failedCount,
    __active__: activeCount,
    COMPLETED: orders.filter((o) => o.status === "COMPLETED").length,
  };

  const rows = orders.filter((o) => {
    if (tab === "") return true;
    if (tab === "__failed__") return o.status.startsWith("FAILED");
    if (tab === "__active__") return !o.status.startsWith("FAILED") && o.status !== "COMPLETED";
    return o.status === tab;
  });

  return (
    <DashboardLayout>
      <div style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>🔁 Swap Inspector</h1>
          {failedCount > 0 && (
            <span style={{
              fontSize: "12px", padding: "3px 10px", borderRadius: "99px",
              background: "#7f1d1d", color: "#fca5a5", fontWeight: 700,
            }}>
              ⚠ {failedCount} need{failedCount === 1 ? "s" : ""} attention
            </span>
          )}
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-tertiary)", marginBottom: "16px" }}>
          Deposit → sweep → swap → settle pipeline for FLOWER orders across Base and Ronin.
        </p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const active = tab === t.value;
            const isFailedTab = t.value === "__failed__";
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                style={{
                  fontSize: "12px", padding: "6px 12px", borderRadius: "99px",
                  border: isFailedTab ? "1px solid #7f1d1d" : "1px solid var(--color-border)",
                  background: active
                    ? (isFailedTab ? "#7f1d1d" : "var(--color-background-tertiary)")
                    : "transparent",
                  color: active
                    ? (isFailedTab ? "#fca5a5" : "var(--color-text-primary)")
                    : (isFailedTab ? "#f87171" : "var(--color-text-tertiary)"),
                  cursor: "pointer",
                }}
              >
                {t.label} ({counts[t.value] || 0})
              </button>
            );
          })}
        </div>

        <div style={{ border: "1px solid var(--color-border)", borderRadius: "12px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              Loading orders...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              No orders for this filter.
            </div>
          ) : (
            <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {rows.map((order) => {
                const isExpanded = expanded === order.orderId;
                const isFailed = order.status.startsWith("FAILED");
                return (
                  <div key={order.orderId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <div
                      onClick={() => setExpanded(isExpanded ? null : order.orderId)}
                      style={{
                        padding: "10px 16px", display: "flex", gap: "12px", alignItems: "center",
                        cursor: "pointer", fontSize: "12px",
                        borderLeft: isFailed ? "3px solid #ef4444" : "3px solid transparent",
                        background: isFailed ? "rgba(239,68,68,0.06)" : "transparent",
                      }}
                    >
                      <span style={{
                        fontFamily: "monospace", minWidth: "110px",
                        color: isFailed ? "#f87171" : order.status === "COMPLETED" ? "#4ade80" : "#facc15",
                      }}>
                        {order.status}
                      </span>
                      <span style={{ fontFamily: "monospace", color: "var(--color-text-tertiary)", minWidth: "90px" }}>
                        {order.orderId.slice(0, 12)}
                      </span>
                      <span style={{ fontFamily: "monospace", color: "var(--color-text-tertiary)", minWidth: "60px" }}>
                        {order.chain}
                      </span>
                      <span style={{ flex: 1, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {order.receivedAmount || order.expectedAmount} FLOWER
                        {order.usdcReceived ? ` → ${order.usdcReceived} USDC` : ""}
                        {isFailed && order.failureReason && (
                          <span style={{ color: "#fca5a5", marginLeft: 8 }}>{order.failureReason}</span>
                        )}
                      </span>
                      <span style={{ color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                        {timeAgo(order.updatedAt)}
                      </span>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "12px 16px 16px", background: "var(--color-background-tertiary)" }}>
                        <div style={{ display: "flex", gap: "20px", marginBottom: "12px", flexWrap: "wrap" }}>
                          {STAGES.map((s) => {
                            const st = stageStatusFor(order, s);
                            const color = st === "done" ? "#4ade80" : st === "failed" ? "#f87171" : st === "active" ? "#facc15" : "#4b5563";
                            const icon = st === "done" ? "✅" : st === "failed" ? "❌" : st === "active" ? "⏳" : "⏸";
                            return (
                              <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                                <span style={{ color }}>{icon}</span>
                                <span style={{ color: "var(--color-text-tertiary)" }}>{s}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                          <div>User: {order.userId}</div>
                          <div>Deposit: {shortAddr(order.depositAddress)}</div>
                          <div>Source: {order.source}</div>
                          <div>Sweep attempts: {order.sweepAttempts ?? 0}</div>
                          {order.sweepTxHash && <div>Sweep tx: {shortAddr(order.sweepTxHash)}</div>}
                          {order.swapTxHash && <div>Swap tx: {shortAddr(order.swapTxHash)}</div>}
                        </div>

                        {(isFailed || order.status === "DEPOSIT_RECEIVED" || order.status === "VERIFIED" || order.status === "SWAPPED") && (
                          <button
                            onClick={() => retry(order.orderId)}
                            disabled={retrying === order.orderId}
                            style={{
                              fontSize: "12px", padding: "6px 14px", borderRadius: "8px",
                              background: "#7c3aed", color: "white", border: "none", cursor: "pointer",
                            }}
                          >
                            {retrying === order.orderId ? "Retrying..." : "↻ Retry"}
                          </button>
                        )}
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
