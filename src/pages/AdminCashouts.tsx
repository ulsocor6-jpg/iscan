import { useState, useEffect } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";

const api = (url, opts = {}) => fetch(url, {
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  ...opts
}).then(r => r.json());

function timeLeft(expiresAt) {
  if (!expiresAt) return null;
  const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return { secs, label: `${m}:${String(s).padStart(2, "0")}` };
}

function VerifyPanel({ cashout, onComplete, onRefund, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api(`/api/v1/admin/withdrawals/${cashout._id}/verify`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cashout._id]);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const handleComplete = async () => {
    setActing(true);
    await onComplete(cashout._id);
    setActing(false);
  };

  const handleRefund = async () => {
    setActing(true);
    await onRefund(cashout._id);
    setActing(false);
  };

  const isPending = cashout.status === "pending_review";
  const remaining = isPending ? timeLeft(cashout.expiresAt) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "500px", maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ color: "var(--color-text-primary)", fontSize: "16px", margin: 0 }}>Cashout Review</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>

        {/* Pre-debited notice */}
        {isPending && (
          <div style={{
            background: "rgba(245,158,11,0.08)", border: "1px solid #b45309", borderRadius: "10px",
            padding: "12px 14px", marginBottom: "12px", fontSize: "12px", color: "#fbbf24"
          }}>
            ⚠️ <strong>Funds already debited from user.</strong> This amount was removed from the
            user's balance the moment they requested it — Proceed only after you've actually sent
            the money.{" "}
            {remaining && (
              <span style={{ color: remaining.secs < 60 ? "#f87171" : "#fbbf24", fontWeight: 700 }}>
                Auto-refunds to user in {remaining.label} if not actioned.
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-tertiary)" }}>Verifying ledger...</div>
        ) : (
          <>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "10px", padding: "16px", marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Requester</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--color-text-primary)" }}>{cashout.userId?.firstName} {cashout.userId?.lastName}</div>
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{cashout.userId?.email}</div>
            </div>

            <div style={{ background: "var(--color-background-secondary)", borderRadius: "10px", padding: "16px", marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Send This Amount To</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Channel</span>
                <span style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>{(cashout.type || "").toUpperCase()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Account</span>
                <span style={{ fontWeight: "700", color: "#60a5fa", fontFamily: "monospace", fontSize: "15px" }}>{cashout.destinationAccount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Account name</span>
                <span style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>{cashout.accountName || "—"}</span>
              </div>
              <div style={{ borderTop: "1px solid var(--color-border-tertiary)", marginTop: "10px", paddingTop: "10px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Amount to send</span>
                <span style={{ fontWeight: "700", color: "#22c55e", fontSize: "20px" }}>₱{(cashout.netAmount || cashout.amount)?.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                <span style={{ color: "var(--color-text-tertiary)", fontSize: "12px" }}>Fee collected</span>
                <span style={{ color: "var(--color-text-tertiary)", fontSize: "12px" }}>₱{(cashout.fee || 0).toFixed(2)}</span>
              </div>
            </div>

            <div style={{
              background: data?.verified ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${data?.verified ? "#16a34a" : "#dc2626"}`,
              borderRadius: "10px", padding: "16px", marginBottom: "12px"
            }}>
              <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px", color: data?.verified ? "#22c55e" : "#ef4444" }}>
                {data?.verified ? "✅ Ledger Verification Passed" : "⚠️ Ledger Entry Not Found"}
              </div>
              {data?.debitProof && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>User debited</span>
                    <span style={{ fontWeight: "700", color: "#ef4444" }}>-₱{data.debitProof.debit?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Ref</span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#60a5fa" }}>{data.debitProof.referenceId}</span>
                  </div>
                </>
              )}
              <div style={{ borderTop: "1px solid var(--color-border-tertiary)", marginTop: "10px", paddingTop: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Balance before</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>₱{data?.userBalance?.before?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Balance after</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: "600" }}>₱{data?.userBalance?.after?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {isPending ? (
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button
                  onClick={handleComplete}
                  disabled={acting}
                  style={{ flex: 2, padding: "14px", borderRadius: "10px", border: "none", background: data?.verified ? "#16a34a" : "#854d0e", color: "white", fontWeight: "700", fontSize: "14px", cursor: "pointer", opacity: acting ? 0.7 : 1 }}
                >
                  {acting ? "Processing..." : "✅ Proceed — I Sent It"}
                </button>
                <button
                  onClick={handleRefund}
                  disabled={acting}
                  style={{ flex: 1, padding: "14px", borderRadius: "10px", border: "1px solid #dc2626", background: "transparent", color: "#ef4444", fontWeight: "600", fontSize: "13px", cursor: "pointer", opacity: acting ? 0.7 : 1 }}
                >
                  ❌ Decline & Refund
                </button>
              </div>
            ) : (
              <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--color-text-tertiary)", textAlign: "center", padding: "10px" }}>
                This request is already {cashout.status.replace("_", " ")} — no further action available.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_MAP = {
  PENDING:  "pending_review",
  COMPLETED: "completed",
  REJECTED: "rejected",
  EXPIRED:  "expired",
  FAILED:   "failed",
};

const STATUS_COLORS = {
  pending_review: "#f59e0b",
  completed: "#22c55e",
  rejected: "#ef4444",
  expired: "#f87171",
  failed: "#dc2626",
};

export default function AdminCashouts() {
  const [cashouts, setCashouts] = useState([]);
  const [filter, setFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    const res = await api("/api/v1/admin/withdrawals/all");
    setCashouts(res.withdrawals || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const flash = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleComplete = async (id) => {
    const res = await api(`/api/v1/admin/withdrawals/${id}/approve`, { method: "POST" });
    if (res.success) { flash("✅ Cashout marked complete."); setSelected(null); load(); }
    else flash("Error: " + res.error, "error");
  };

  const handleRefund = async (id) => {
    const reason = window.prompt("Reason for declining (refund is automatic):", "Cancelled by admin");
    if (reason === null) return;
    const res = await api(`/api/v1/admin/withdrawals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
    if (res.success) { flash("🔄 Declined — refunded to user automatically."); setSelected(null); load(); }
    else flash("Error: " + res.error, "error");
  };

  const filtered = filter === "ALL" ? cashouts : cashouts.filter(c => c.status === STATUS_MAP[filter]);
  const statusLabel = (s) => Object.keys(STATUS_MAP).find(k => STATUS_MAP[k] === s) || s.toUpperCase();

  return (
    <DashboardLayout>
      <div style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "600", color: "var(--color-text-primary)", margin: 0 }}>Cashout Requests</h1>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>Click a request to review ledger proof before releasing</p>
          </div>
          <button onClick={load} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", cursor: "pointer", fontSize: "13px" }}>🔄 Refresh</button>
        </div>

        {msg && (
          <div style={{
            padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px",
            background: msg.type === "error" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
            color: msg.type === "error" ? "#ef4444" : "#22c55e",
            border: `1px solid ${msg.type === "error" ? "#dc2626" : "#16a34a"}`
          }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {["PENDING", "COMPLETED", "REJECTED", "EXPIRED", "ALL"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "6px 16px", borderRadius: "99px", fontSize: "12px", fontWeight: "500", cursor: "pointer",
              border: filter === f ? "none" : "1px solid var(--color-border-tertiary)",
              background: filter === f ? (STATUS_COLORS[STATUS_MAP[f]] || "#6366f1") : "var(--color-background-secondary)",
              color: filter === f ? "#fff" : "var(--color-text-secondary)"
            }}>
              {f} {f !== "ALL" && `(${cashouts.filter(c => c.status === STATUS_MAP[f]).length})`}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Pending", value: cashouts.filter(c => c.status === "pending_review").length, color: "#f59e0b" },
            { label: "Total Pending ₱", value: "₱" + cashouts.filter(c => c.status === "pending_review").reduce((a, c) => a + (c.netAmount || c.amount || 0), 0).toFixed(2), color: "#f59e0b" },
            { label: "Completed Today", value: cashouts.filter(c => c.status === "completed" && new Date(c.approvedAt).toDateString() === new Date().toDateString()).length, color: "#22c55e" },
            { label: "Total Paid Out", value: "₱" + cashouts.filter(c => c.status === "completed").reduce((a, c) => a + (c.netAmount || 0), 0).toFixed(2), color: "#22c55e" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "4px" }}>{label}</div>
              <div style={{ fontSize: "20px", fontWeight: "600", color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "12px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-tertiary)" }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-tertiary)" }}>No {filter.toLowerCase()} requests.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  {["Date", "User", "Amount", "Net", "Channel", "Account", "Status", "Action"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: "500", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c._id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", cursor: "pointer" }}
                    onClick={() => setSelected(c)}>
                    <td style={{ padding: "12px 16px", color: "var(--color-text-secondary)", fontSize: "12px" }}>{new Date(c.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ padding: "12px 16px", color: "var(--color-text-primary)", fontWeight: "500" }}>
                      {c.userId?.firstName
                        ? `${c.userId.firstName} ${c.userId.lastName || ""}`.trim()
                        : String(c.userId?._id || c.userId).slice(-6)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--color-text-primary)", fontWeight: "600" }}>₱{(c.amount || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", color: "#22c55e", fontWeight: "700" }}>₱{(c.netAmount || c.amount || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: "99px", fontSize: "11px", fontWeight: "600", background: "var(--color-background-tertiary)", color: "var(--color-text-secondary)" }}>{(c.type || "—").toUpperCase()}</span></td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: "700", color: "#60a5fa" }}>{c.destinationAccount || "—"}</div>
                      {c.accountName && (
                        <div style={{
                          fontSize: "11px", marginTop: "2px",
                          color: c.userId?.firstName &&
                                 c.accountName.toLowerCase().trim() !==
                                   `${c.userId.firstName} ${c.userId.lastName || ""}`.toLowerCase().trim()
                            ? "#f59e0b"
                            : "var(--color-text-tertiary)"
                        }}>
                          {c.accountName}
                          {c.userId?.firstName &&
                            c.accountName.toLowerCase().trim() !==
                              `${c.userId.firstName} ${c.userId.lastName || ""}`.toLowerCase().trim() &&
                            " ⚠️ name mismatch"}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}><span style={{ fontSize: "12px", fontWeight: "700", color: STATUS_COLORS[c.status] || "#94a3b8" }}>{statusLabel(c.status)}</span></td>
                    <td style={{ padding: "12px 16px" }}>
                      {c.status === "pending_review"
                        ? <span style={{ fontSize: "12px", color: "#60a5fa", textDecoration: "underline" }}>Review →</span>
                        : <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>{c.failReason || "—"}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <VerifyPanel
          cashout={selected}
          onComplete={handleComplete}
          onRefund={handleRefund}
          onClose={() => setSelected(null)}
        />
      )}
    </DashboardLayout>
  );
}
