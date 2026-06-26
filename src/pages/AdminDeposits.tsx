import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface DirectDeposit {
  _id: string;
  referenceId: string;
  amount: number;
  status: string;
  channel: string;
  senderName?: string;
  adminNote?: string;
  verificationResult?: string;
  createdAt: string;
  expiresAt: string;
  userId: { email: string; firstName: string; lastName: string } | string;
}

interface CryptoDeposit {
  _id: string;
  referenceId: string;
  usdAmount: number;
  token: string;
  status: string;
  chainId: string;
  detectedTxHash?: string;
  expectedAddress: string;
  createdAt: string;
  userId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusPill(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    PENDING:        { bg: "#1e3a5f", color: "#60a5fa", label: "Pending" },
    CREDITED:       { bg: "#14532d", color: "#4ade80", label: "Credited" },
    EXPIRED:        { bg: "#3b1f1f", color: "#f87171", label: "Expired" },
    PENDING_REVIEW: { bg: "#422006", color: "#fb923c", label: "Review" },
    ADMIN_APPROVED: { bg: "#14532d", color: "#4ade80", label: "Approved" },
    ADMIN_REJECTED: { bg: "#3b1f1f", color: "#f87171", label: "Rejected" },
    deposit_detected: { bg: "#1e3a5f", color: "#60a5fa", label: "Detected" },
    completed:      { bg: "#14532d", color: "#4ade80", label: "Completed" },
    failed:         { bg: "#3b1f1f", color: "#f87171", label: "Failed" },
    confirming:     { bg: "#2d1f42", color: "#c084fc", label: "Confirming" },
  };
  const s = map[status] || { bg: "#1d2942", color: "#94a3b8", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 6,
      padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{s.label}</span>
  );
}

const channelIcon: Record<string, string> = {
  MAYA: "🟣", GCASH: "💙", BANK: "🏦", MARIBANK: "🏦",
};

// ── PHP Deposits (Maya / GCash / Bank) ───────────────────────────────────────

function PhpDepositRow({ dep, onAction }: { dep: DirectDeposit; onAction: () => void }) {
  const [senderName, setSenderName] = useState(dep.senderName || "");
  const [note, setNote]             = useState("");
  const [busy, setBusy]             = useState(false);
  const [msg, setMsg]               = useState("");

  const user = typeof dep.userId === "object"
    ? `${dep.userId.firstName} ${dep.userId.lastName} (${dep.userId.email})`
    : dep.userId;

  async function confirm() {
    if (!senderName.trim()) { setMsg("Enter sender name first"); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/v1/deposit/admin/confirm", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId: dep.referenceId, senderName, adminNote: note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg(`✅ Credited ₱${d.credited}`);
      setTimeout(onAction, 1200);
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/v1/deposit/admin/cancel", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId: dep.referenceId, reason: note || "Admin cancelled" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg("🗑 Cancelled");
      setTimeout(onAction, 1200);
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(false); }
  }

  const isPending = dep.status === "PENDING" || dep.status === "PENDING_REVIEW";

  return (
    <div style={{
      background: "#0d1526", border: "1px solid #1d2942", borderRadius: 10,
      padding: "16px 20px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{channelIcon[dep.channel] || "💰"}</span>
            <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>₱{dep.amount.toLocaleString()}</span>
            {statusPill(dep.status)}
            <span style={{ color: "#475569", fontSize: 11 }}>{timeAgo(dep.createdAt)}</span>
          </div>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            <span style={{ marginRight: 12 }}>👤 {user}</span>
            <span style={{ marginRight: 12 }}>📋 {dep.referenceId}</span>
            <span>{dep.channel}</span>
          </div>
          {dep.verificationResult && (
            <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 4 }}>
              ⚠️ {dep.verificationResult.replace(/_/g, " ")}
            </div>
          )}
        </div>
        <div style={{ color: "#475569", fontSize: 11 }}>
          Expires {new Date(dep.expiresAt).toLocaleTimeString()}
        </div>
      </div>

      {isPending && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            placeholder="Sender name"
            value={senderName}
            onChange={e => setSenderName(e.target.value)}
            style={{
              background: "#121b2f", border: "1px solid #1d2942", borderRadius: 6,
              color: "white", padding: "6px 10px", fontSize: 12, flex: "1 1 140px",
            }}
          />
          <input
            placeholder="Admin note (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{
              background: "#121b2f", border: "1px solid #1d2942", borderRadius: 6,
              color: "white", padding: "6px 10px", fontSize: 12, flex: "2 1 180px",
            }}
          />
          <button onClick={confirm} disabled={busy} style={{
            background: "#16a34a", border: "none", borderRadius: 6, color: "white",
            padding: "6px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12,
            opacity: busy ? 0.6 : 1,
          }}>✓ Credit</button>
          <button onClick={cancel} disabled={busy} style={{
            background: "#991b1b", border: "none", borderRadius: 6, color: "white",
            padding: "6px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12,
            opacity: busy ? 0.6 : 1,
          }}>✕ Cancel</button>
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.startsWith("✅") ? "#4ade80" : "#f87171" }}>{msg}</div>}
    </div>
  );
}

// ── Crypto Deposits (on-chain) ───────────────────────────────────────────────

function CryptoDepositRow({ dep, onAction }: { dep: CryptoDeposit; onAction: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState("");

  const chainLabel: Record<string, string> = {
    base: "🔵 Base", ronin: "🗡️ Ronin", tron: "🔴 TRON", "0x1": "ETH",
  };

  async function approve() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/v1/admin/deposits/${dep._id}/approve`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg("✅ Approved & credited");
      setTimeout(onAction, 1200);
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(false); }
  }

  return (
    <div style={{
      background: "#0d1526", border: "1px solid #1d2942", borderRadius: 10,
      padding: "16px 20px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>
              {dep.usdAmount} {dep.token}
            </span>
            {statusPill(dep.status)}
            <span style={{ color: "#475569", fontSize: 11 }}>{timeAgo(dep.createdAt)}</span>
          </div>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            <span style={{ marginRight: 12 }}>{chainLabel[dep.chainId] || dep.chainId}</span>
            {dep.detectedTxHash && (
              <span style={{ marginRight: 12 }}>
                🔗 <a
                  href={`https://basescan.org/tx/${dep.detectedTxHash}`}
                  target="_blank" rel="noreferrer"
                  style={{ color: "#3b82f6", textDecoration: "none" }}
                >
                  {dep.detectedTxHash.slice(0, 12)}...
                </a>
              </span>
            )}
            <span style={{ wordBreak: "break-all" }}>📬 {dep.expectedAddress}</span>
          </div>
        </div>
      </div>

      {dep.status === "deposit_detected" && (
        <div style={{ marginTop: 12 }}>
          <button onClick={approve} disabled={busy} style={{
            background: "#16a34a", border: "none", borderRadius: 6, color: "white",
            padding: "6px 20px", cursor: "pointer", fontWeight: 700, fontSize: 12,
            opacity: busy ? 0.6 : 1,
          }}>✓ Approve & Credit</button>
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.startsWith("✅") ? "#4ade80" : "#f87171" }}>{msg}</div>}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDeposits() {
  const [tab, setTab]               = useState<"php" | "crypto">("php");
  const [phpDeps, setPhpDeps]       = useState<DirectDeposit[]>([]);
  const [cryptoDeps, setCryptoDeps] = useState<CryptoDeposit[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [phpRes, cryptoRes] = await Promise.all([
        fetch("/api/v1/deposit/admin/pending", { credentials: "include" }),
        fetch("/api/v1/admin/deposits/pending",  { credentials: "include" }),
      ]);
      const phpData    = await phpRes.json();
      const cryptoData = await cryptoRes.json();
      if (phpData.success)    setPhpDeps(phpData.deposits    || []);
      if (cryptoData.success) setCryptoDeps(cryptoData.deposits || []);
      setLastRefresh(new Date());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchAll]);

  const totalPending = phpDeps.length + cryptoDeps.length;

  return (
    <DashboardLayout>
      <div className="dashboard">

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: "white" }}>
              Deposit Monitor
              {totalPending > 0 && (
                <span style={{
                  marginLeft: 10, background: "#dc2626", color: "white",
                  borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700,
                }}>{totalPending}</span>
              )}
            </h2>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
              Last refreshed {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s
            </div>
          </div>
          <button onClick={fetchAll} disabled={loading} style={{
            background: "#1d2942", border: "1px solid #334155", borderRadius: 8,
            color: "white", padding: "8px 18px", cursor: "pointer", fontSize: 13,
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#3b1f1f", border: "1px solid #dc2626", borderRadius: 8, padding: "10px 16px", color: "#f87171", marginBottom: 16, fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        {/* Summary cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "PHP Pending", value: phpDeps.length, color: "#3b82f6", icon: "💵" },
            { label: "Crypto Detected", value: cryptoDeps.length, color: "#8b5cf6", icon: "🔗" },
            { label: "Total Action Needed", value: totalPending, color: "#f59e0b", icon: "⚠️" },
          ].map(s => (
            <div key={s.label} style={{
              background: "#0d1526", border: "1px solid #1d2942", borderRadius: 10,
              padding: "14px 20px", flex: "1 1 140px", minWidth: 140,
            }}>
              <div style={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}>{s.icon} {s.label}</div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {([["php", "💵 PHP Deposits", phpDeps.length], ["crypto", "🔗 Crypto Deposits", cryptoDeps.length]] as const).map(([id, label, count]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              background: tab === id ? "#3b82f6" : "#1d2942", color: "white",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              {label}
              {count > 0 && (
                <span style={{
                  background: tab === id ? "rgba(255,255,255,0.25)" : "#dc2626",
                  borderRadius: 10, padding: "0 7px", fontSize: 11,
                }}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "php" && (
          <div>
            {phpDeps.length === 0 ? (
              <div style={{ color: "#475569", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
                No pending PHP deposits
              </div>
            ) : (
              phpDeps.map(d => <PhpDepositRow key={d._id} dep={d} onAction={fetchAll} />)
            )}
          </div>
        )}

        {tab === "crypto" && (
          <div>
            {cryptoDeps.length === 0 ? (
              <div style={{ color: "#475569", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
                No pending crypto deposits
              </div>
            ) : (
              cryptoDeps.map(d => <CryptoDepositRow key={d._id} dep={d} onAction={fetchAll} />)
            )}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
