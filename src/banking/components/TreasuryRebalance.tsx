// src/banking/components/dashboard/TreasuryRebalance.tsx
import { useState } from "react";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#f59e0b",
  COMPLETED: "#22c55e",
  EXPIRED: "#ef4444",
  FAILED: "#ef4444",
};
const STATUS_BG: Record<string, string> = {
  PENDING: "rgba(245,158,11,0.08)",
  COMPLETED: "rgba(34,197,94,0.08)",
  EXPIRED: "rgba(239,68,68,0.08)",
  FAILED: "rgba(239,68,68,0.08)",
};
const STATUS_ICON: Record<string, string> = {
  PENDING: "⏳",
  COMPLETED: "✅",
  EXPIRED: "⌛",
  FAILED: "❌",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #1d2942",
  background: "#0d1526",
  color: "white",
  fontSize: 13,
} as const;

const labelStyle = {
  color: "#94a3b8",
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 1,
  marginBottom: 6,
  display: "block" as const,
};

const selectStyle = { ...inputStyle };

type Account = {
  _id: string;
  provider: string;
  label: string;
  currency: string;
  physicalBalance: number;
  reserved: number;
  safetyReserve: number;
  available: number;
};

type SweepIntent = {
  operationId: string;
  asset: string;
  provider: string;
  expectedAmount: number;
  tolerance: number;
  status: string;
  expiration: string;
  createdAt: string;
  metadata?: {
    sourceProvider?: string;
    phpAmount?: number;
    baselineBalance?: number;
    observedDelta?: number;
    matchedAt?: string;
  };
};

export default function TreasuryRebalance({
  accounts,
  sweepIntents,
  onRebalance,
  onCreateSweepIntent,
}: {
  accounts: Account[];
  sweepIntents: SweepIntent[];
  onRebalance: (sourceId: string, destId: string, amount: number, note: string) => Promise<void>;
  onCreateSweepIntent: (
    sourceId: string,
    phpAmount: number,
    expectedAsset: string,
    expectedAssetAmount: number,
    expirationMinutes: number
  ) => Promise<void>;
}) {
  const phpAccounts = accounts.filter(a => a.currency === "PHP");

  const [rbSource, setRbSource] = useState("");
  const [rbDest, setRbDest] = useState("");
  const [rbAmount, setRbAmount] = useState("");
  const [rbNote, setRbNote] = useState("");
  const [rbSubmitting, setRbSubmitting] = useState(false);

  const submitRebalance = async () => {
    const amt = parseFloat(rbAmount);
    if (!rbSource || !rbDest || !amt || amt <= 0) return;
    setRbSubmitting(true);
    try {
      await onRebalance(rbSource, rbDest, amt, rbNote);
      setRbAmount("");
      setRbNote("");
    } finally {
      setRbSubmitting(false);
    }
  };

  const [swSource, setSwSource] = useState("");
  const [swPhpAmount, setSwPhpAmount] = useState("");
  const [swAsset, setSwAsset] = useState("USDC");
  const [swAssetAmount, setSwAssetAmount] = useState("");
  const [swExpiration, setSwExpiration] = useState("60");
  const [swSubmitting, setSwSubmitting] = useState(false);

  const submitSweepIntent = async () => {
    const phpAmt = parseFloat(swPhpAmount);
    const assetAmt = parseFloat(swAssetAmount);
    const expMin = parseFloat(swExpiration);
    if (!swSource || !phpAmt || phpAmt <= 0 || !assetAmt || assetAmt <= 0) return;
    setSwSubmitting(true);
    try {
      await onCreateSweepIntent(swSource, phpAmt, swAsset, assetAmt, expMin || 60);
      setSwPhpAmount("");
      setSwAssetAmount("");
    } finally {
      setSwSubmitting(false);
    }
  };

  function timeLeft(expiration: string, status: string) {
    if (status !== "PENDING") return null;
    const ms = new Date(expiration).getTime() - Date.now();
    if (ms <= 0) return "expiring";
    const mins = Math.ceil(ms / 60000);
    return `~${mins} min left`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        <div style={{ background: "#0d1526", border: "1px solid #1d2942", borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 4 }}>
            🔁 Rebalance PHP Accounts
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>
            Book-only. Move real money between providers yourself first (e.g. Maribank → Maya via a fee-free
            transfer), then record it here to match the ledger to reality.
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={labelStyle}>From</span>
            <select style={selectStyle} value={rbSource} onChange={e => setRbSource(e.target.value)}>
              <option value="">Select source account</option>
              {phpAccounts.map(a => (
                <option key={a._id} value={a._id}>
                  {a.label} ({a.provider}) — ₱{a.available.toFixed(2)} available
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={labelStyle}>To</span>
            <select style={selectStyle} value={rbDest} onChange={e => setRbDest(e.target.value)}>
              <option value="">Select destination account</option>
              {phpAccounts.filter(a => a._id !== rbSource).map(a => (
                <option key={a._id} value={a._id}>
                  {a.label} ({a.provider})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div>
              <span style={labelStyle}>Amount (₱)</span>
              <input type="number" style={inputStyle} value={rbAmount}
                onChange={e => setRbAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <span style={labelStyle}>Note (optional)</span>
              <input type="text" style={inputStyle} value={rbNote}
                onChange={e => setRbNote(e.target.value)} placeholder="Reference / reason" />
            </div>
          </div>

          <button
            onClick={submitRebalance}
            disabled={rbSubmitting || !rbSource || !rbDest || !rbAmount}
            style={{
              width: "100%", padding: "10px 16px", borderRadius: 8, border: "none",
              background: "#3b82f6", color: "white", fontWeight: 700, fontSize: 13,
              cursor: "pointer",
              opacity: rbSubmitting || !rbSource || !rbDest || !rbAmount ? 0.5 : 1,
            }}
          >
            {rbSubmitting ? "Recording…" : "Record Rebalance"}
          </button>
        </div>

        <div style={{ background: "#0d1526", border: "1px solid #1d2942", borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 4 }}>
            💱 Sweep PHP → Crypto (MEXC)
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>
            Declares expected result before you do the P2P buy manually in the MEXC app. The watcher confirms
            the actual amount that lands and credits it automatically — nothing is credited until confirmed.
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={labelStyle}>Source PHP Account</span>
            <select style={selectStyle} value={swSource} onChange={e => setSwSource(e.target.value)}>
              <option value="">Select source account</option>
              {phpAccounts.map(a => (
                <option key={a._id} value={a._id}>
                  {a.label} ({a.provider}) — ₱{a.available.toFixed(2)} available
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <span style={labelStyle}>PHP Amount</span>
              <input type="number" style={inputStyle} value={swPhpAmount}
                onChange={e => setSwPhpAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <span style={labelStyle}>Expected Asset</span>
              <input type="text" style={inputStyle} value={swAsset}
                onChange={e => setSwAsset(e.target.value.toUpperCase())} placeholder="USDC" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div>
              <span style={labelStyle}>Expected {swAsset || "Asset"} Amount</span>
              <input type="number" style={inputStyle} value={swAssetAmount}
                onChange={e => setSwAssetAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <span style={labelStyle}>Expires in (minutes)</span>
              <input type="number" style={inputStyle} value={swExpiration}
                onChange={e => setSwExpiration(e.target.value)} placeholder="60" />
            </div>
          </div>

          <button
            onClick={submitSweepIntent}
            disabled={swSubmitting || !swSource || !swPhpAmount || !swAssetAmount}
            style={{
              width: "100%", padding: "10px 16px", borderRadius: 8, border: "none",
              background: "#a78bfa", color: "white", fontWeight: 700, fontSize: 13,
              cursor: "pointer",
              opacity: swSubmitting || !swSource || !swPhpAmount || !swAssetAmount ? 0.5 : 1,
            }}
          >
            {swSubmitting ? "Declaring…" : "Declare Sweep Intent"}
          </button>
        </div>

      </div>

      <div style={{ background: "#0d1526", border: "1px solid #1d2942", borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
          Sweep Intents ({sweepIntents.length})
        </div>

        {sweepIntents.length === 0 ? (
          <div style={{ color: "#4a5568", fontSize: 13, textAlign: "center", padding: 24 }}>
            No sweep intents yet — declare one above to start watching for it.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#94a3b8", borderBottom: "1px solid #1d2942" }}>
                  {["Status", "Source", "PHP Amount", "Expected", "Observed", "Declared", "Time Left"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sweepIntents.map(op => {
                  const color = STATUS_COLOR[op.status] ?? "#94a3b8";
                  const bg = STATUS_BG[op.status] ?? "transparent";
                  return (
                    <tr key={op.operationId} style={{ borderBottom: "1px solid #0a1020", color: "white" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                          color, background: bg, border: `1px solid ${color}40`,
                        }}>
                          {STATUS_ICON[op.status]} {op.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#94a3b8" }}>
                        {op.metadata?.sourceProvider ?? "—"}
                      </td>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>
                        ₱{(op.metadata?.phpAmount ?? 0).toFixed(2)}
                      </td>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>
                        {op.expectedAmount.toFixed(4)} {op.asset}
                      </td>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace", color: op.metadata?.observedDelta ? "#22c55e" : "#4a5568" }}>
                        {op.metadata?.observedDelta ? `${op.metadata.observedDelta.toFixed(4)} ${op.asset}` : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {new Date(op.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#f59e0b" }}>
                        {timeLeft(op.expiration, op.status) ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
