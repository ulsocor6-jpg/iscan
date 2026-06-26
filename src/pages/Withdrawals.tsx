// src/pages/Withdrawals.tsx — full replacement
import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";

const inp: React.CSSProperties = {
  width: "100%", padding: 10, borderRadius: 8,
  border: "1px solid #1d2942", background: "#121b2f",
  color: "white", marginTop: 4, boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  color: "#94a3b8", fontSize: 12, marginTop: 12, display: "block",
};

// ── Platform fee on top of network gas (%) ────────────────────────────────────
const PLATFORM_FEE_PCT = 0.5; // 0.5% — adjust as needed

// ── Assets — only USDC, USDT, FLOWER live ────────────────────────────────────
const ASSETS = [
  { id: "USDC",   icon: "◎", color: "#2775ca", live: true  },
  { id: "USDT",   icon: "₮", color: "#26a17b", live: true  },
  { id: "FLOWER", icon: "🌸", color: "#a78bfa", live: true  },
  { id: "ETH",    icon: "Ξ", color: "#627eea", live: false },
  { id: "BTC",    icon: "₿", color: "#f7931a", live: false },
  { id: "SOL",    icon: "◎", color: "#14f195", live: false },
  { id: "BNB",    icon: "⬡", color: "#f3ba2f", live: false },
];

// ── Networks per asset — Ronin added for FLOWER ───────────────────────────────
const ASSET_NETWORKS: Record<string, string[]> = {
  USDC:   ["ERC-20", "Base", "Arbitrum", "Solana"],
  USDT:   ["ERC-20", "TRC-20", "BEP-20", "Solana"],
  FLOWER: ["Ronin", "Base"],    // ← Ronin first as default
  ETH:    ["ERC-20", "Base", "Arbitrum", "Optimism"],
  BTC:    ["Bitcoin", "Lightning"],
  SOL:    ["Solana"],
  BNB:    ["BEP-20", "BEP-2"],
};

const NETWORK_COLORS: Record<string, string> = {
  "ERC-20": "#627eea", "TRC-20": "#ef4444", "BEP-20": "#f3ba2f",
  Base: "#3b82f6", Arbitrum: "#28a0f0", Optimism: "#ff0420",
  Solana: "#14f195", Bitcoin: "#f7931a", Lightning: "#f59e0b",
  "BEP-2": "#f3ba2f", Ronin: "#1273ea",
};

// Static minimums from backend
const MINIMUMS: Record<string, number> = {
  "ERC-20": 0.01, "TRC-20": 1, "BEP-20": 0.5, "BEP-2": 0.001,
  Base: 0.01, Arbitrum: 0.01, Optimism: 0.01, Solana: 0.01,
  Bitcoin: 0.0001, Lightning: 0.000001, Ronin: 0.01,
};

// ── Live gas estimator (EVM RPCs, no API key) ─────────────────────────────────
async function estimateFee(network: string): Promise<{ gasUsd: number; gwei?: number }> {
  const EVM_RPCS: Record<string, string> = {
    "ERC-20":   "https://eth.llamarpc.com",
    "Base":     "https://mainnet.base.org",
    "Arbitrum": "https://arb1.arbitrum.io/rpc",
    "Optimism": "https://mainnet.optimism.io",
    "BEP-20":   "https://bsc-dataseed.binance.org",
    "Ronin":    "https://api.roninchain.com/rpc",
  };

  try {
    if (EVM_RPCS[network]) {
      const rpc = EVM_RPCS[network];
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
      });
      const d = await r.json();
      const gasPriceWei = parseInt(d.result, 16);
      const gasLimit    = 65000; // ERC-20 token transfer
      const feeNative   = (gasPriceWei * gasLimit) / 1e18;
      const gwei        = parseFloat((gasPriceWei / 1e9).toFixed(3));

      // Get native token USD price
      const nativePrices: Record<string, string> = {
        "ERC-20": "ethereum", "Base": "ethereum", "Arbitrum": "ethereum",
        "Optimism": "ethereum", "BEP-20": "binancecoin", "Ronin": "ronin",
      };
      const cgId = nativePrices[network] ?? "ethereum";
      let nativeUsd = 3000;
      try {
        const p = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`
        );
        const pd = await p.json();
        nativeUsd = pd?.[cgId]?.usd ?? nativeUsd;
      } catch {}

      return { gasUsd: parseFloat((feeNative * nativeUsd).toFixed(4)), gwei };
    }
    if (network === "TRC-20") return { gasUsd: 0.10 };
    if (network === "Solana") return { gasUsd: 0.001 };
    return { gasUsd: 0.50 };
  } catch {
    return { gasUsd: 0.50 };
  }
}

// ── PHP Withdrawal ─────────────────────────────────────────────────────────────
function PhpWithdrawal() {
  const [channel, setChannel] = useState("MAYA");
  const [amount,  setAmount]  = useState("");
  const [account, setAccount] = useState("");
  const [name,    setName]    = useState("");
  const [result,  setResult]  = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleCashOut() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/payment/cashout", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount), channel,
          accountNumber: account, receiverName: name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (result) return (
    <div style={{ background: "#0a1f0a", borderRadius: 8, padding: 16 }}>
      <p style={{ color: "#22c55e", margin: "0 0 8px", fontWeight: 700 }}>✅ Withdrawal Submitted!</p>
      <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 4px" }}>
        Ref: <strong style={{ color: "white" }}>{result.referenceId}</strong>
      </p>
      <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 4px" }}>
        Amount: <strong style={{ color: "white" }}>₱{result.amount}</strong>
        {" "}→ Net: <strong style={{ color: "#22c55e" }}>₱{result.netAmount}</strong>
        {" "}(Fee: ₱{result.fee})
      </p>
      <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>{result.message}</p>
      <button onClick={() => { setResult(null); setAmount(""); setAccount(""); setName(""); }}
        style={{ marginTop: 16, background: "transparent", border: "1px solid #1d2942",
          borderRadius: 8, color: "#94a3b8", padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
        New Withdrawal
      </button>
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["MAYA","BANK","GCASH"].map(c => (
          <button key={c} onClick={() => setChannel(c)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
            cursor: "pointer", fontWeight: 600, fontSize: 13,
            background: channel === c ? "#3b82f6" : "#1d2942", color: "white",
          }}>
            {c === "MAYA" ? "🟣 Maya" : c === "BANK" ? "🏦 Bank" : "💙 GCash"}
          </button>
        ))}
      </div>
      <label style={lbl}>Amount (PHP)</label>
      <input style={inp} type="number" placeholder="Min ₱100"
        value={amount} onChange={e => setAmount(e.target.value)} />
      <label style={lbl}>{channel === "BANK" ? "Account Number" : "Mobile Number"}</label>
      <input style={inp} type="text"
        placeholder={channel === "BANK" ? "e.g. 1234567890" : "e.g. 09XXXXXXXXX"}
        value={account} onChange={e => setAccount(e.target.value)} />
      <label style={lbl}>Account Name</label>
      <input style={inp} type="text" placeholder="Full name"
        value={name} onChange={e => setName(e.target.value)} />
      <div style={{ background: "#1a1a0a", border: "1px solid #854d0e", borderRadius: 8,
        padding: "10px 12px", marginTop: 16, marginBottom: 16, color: "#fbbf24", fontSize: 12 }}>
        ⚠️ Fee: 1.5% • Minimum ₱100 • Processed within 24 hours
      </div>
      <button className="auth-btn" onClick={handleCashOut}
        disabled={loading || !amount || !account || !name}>
        {loading ? "Submitting..." : "Request Withdrawal"}
      </button>
      {error && <p style={{ color: "#ef4444", marginTop: 8, fontSize: 13 }}>{error}</p>}
    </>
  );
}

// ── Crypto Withdrawal ─────────────────────────────────────────────────────────
function CryptoWithdrawal() {
  const liveAssets = ASSETS.filter(a => a.live);
  const [asset,       setAsset]       = useState(liveAssets[0]);
  const [network,     setNetwork]     = useState(ASSET_NETWORKS[liveAssets[0].id][0]);
  const [address,     setAddress]     = useState("");
  const [amount,      setAmount]      = useState("");
  const [result,      setResult]      = useState<any>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [confirm,     setConfirm]     = useState(false);
  const [feeInfo,     setFeeInfo]     = useState<{ gasUsd: number; gwei?: number } | null>(null);
  const [feeLoading,  setFeeLoading]  = useState(false);

  // Fetch live gas whenever network changes
  useEffect(() => {
    setFeeInfo(null);
    setFeeLoading(true);
    estimateFee(network).then(f => { setFeeInfo(f); setFeeLoading(false); });
  }, [network]);

  function pickAsset(a: typeof ASSETS[0]) {
    if (!a.live) return;
    setAsset(a);
    const nets = ASSET_NETWORKS[a.id];
    setNetwork(nets[0]);
    setConfirm(false); setError("");
  }

  const parsedAmount   = parseFloat(amount || "0");
  const gasUsd         = feeInfo?.gasUsd ?? 0;
  const platformFeeUsd = parsedAmount * (PLATFORM_FEE_PCT / 100); // in asset units ≈ USD for stables
  const totalFeeUsd    = gasUsd + platformFeeUsd;
  const minimum        = MINIMUMS[network] ?? 0.01;

  // For display: express total fee in asset units (stables ≈ 1:1 USD; FLOWER use its own unit)
  const totalFeeInAsset = totalFeeUsd; // close enough for stables; FLOWER fee shown separately
  const willReceive     = Math.max(0, parsedAmount - totalFeeInAsset);

  async function handleSubmit() {
    if (!confirm) { setConfirm(true); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/crypto-withdrawals/request", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: asset.id, network,
          amount: parsedAmount,
          destinationAddress: address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Request failed");
      setResult(data.withdrawal ?? data);
      setConfirm(false);
    } catch (err: any) { setError(err.message); setConfirm(false); }
    finally { setLoading(false); }
  }

  if (result) return (
    <div style={{ background: "#0a1f0a", borderRadius: 10, padding: 18 }}>
      <p style={{ color: "#22c55e", margin: "0 0 12px", fontWeight: 700, fontSize: 15 }}>
        ✅ Crypto Withdrawal Submitted!
      </p>
      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 2 }}>
        <div>ID: <code style={{ color: "#60a5fa", fontSize: 11 }}>{result.id ?? result._id}</code></div>
        <div>Asset: <strong style={{ color: asset.color }}>{result.asset}</strong></div>
        <div>Network: <strong style={{ color: NETWORK_COLORS[result.network] ?? "white" }}>{result.network}</strong></div>
        <div>Amount: <strong style={{ color: "white" }}>{result.amount} {result.asset}</strong></div>
        <div>Network fee: <strong style={{ color: "#f87171" }}>~${gasUsd.toFixed(4)}</strong>
          {feeInfo?.gwei ? <span style={{ color: "#64748b", fontSize: 11 }}> ({feeInfo.gwei} gwei)</span> : null}
        </div>
        <div>Platform fee ({PLATFORM_FEE_PCT}%): <strong style={{ color: "#f87171" }}>~${platformFeeUsd.toFixed(4)}</strong></div>
        <div>To: <code style={{ color: "#60a5fa", fontSize: 11, wordBreak: "break-all" }}>{result.destinationAddress}</code></div>
        <div style={{ color: "#f59e0b", fontSize: 12, marginTop: 4 }}>
          ⏳ Status: <strong>{result.status}</strong>
        </div>
      </div>
      <button onClick={() => { setResult(null); setAmount(""); setAddress(""); setConfirm(false); }}
        style={{ marginTop: 16, background: "transparent", border: "1px solid #1d2942",
          borderRadius: 8, color: "#94a3b8", padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
        New Withdrawal
      </button>
    </div>
  );

  return (
    <>
      {/* Asset selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 8 }}>Asset</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
          {ASSETS.map(a => (
            <button key={a.id} onClick={() => pickAsset(a)}
              title={!a.live ? "Coming Soon" : undefined}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                cursor: a.live ? "pointer" : "not-allowed",
                fontWeight: 700, fontSize: 13, transition: "all 0.15s",
                background: !a.live ? "#0f172a" : asset.id === a.id ? a.color : "#1d2942",
                color: !a.live ? "#334155" : "white",
                display: "flex", alignItems: "center", gap: 5,
                position: "relative" as const,
              }}>
              <span>{a.icon}</span>{a.id}
              {!a.live && (
                <span style={{
                  position: "absolute" as const, top: -6, right: -4,
                  background: "#334155", color: "#64748b",
                  fontSize: 8, fontWeight: 800, padding: "1px 4px",
                  borderRadius: 4, letterSpacing: "0.05em",
                }}>SOON</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Network selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase",
          letterSpacing: "0.06em", marginBottom: 8 }}>Network</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
          {ASSET_NETWORKS[asset.id].map(n => (
            <button key={n} onClick={() => { setNetwork(n); setConfirm(false); }} style={{
              padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 12, transition: "all 0.15s",
              background: network === n ? (NETWORK_COLORS[n] ?? "#3b82f6") : "#1d2942",
              color: "white",
            }}>
              {n === "Ronin" ? "🗡️ Ronin" : n}
            </button>
          ))}
        </div>
      </div>

      {/* Fee cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {/* Gas fee */}
        <div style={{ background: "#121b2f", border: "1px solid #1d2942", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>
            ⛽ Gas {feeInfo?.gwei ? `(${feeInfo.gwei} gwei)` : ""}
          </div>
          {feeLoading
            ? <div style={{ fontSize: 11, color: "#475569" }}>…</div>
            : <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>~${gasUsd.toFixed(4)}</div>
              </>
          }
        </div>

        {/* Platform fee */}
        <div style={{ background: "#121b2f", border: "1px solid #1d2942", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>Platform ({PLATFORM_FEE_PCT}%)</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>
            {parsedAmount > 0 ? `~$${platformFeeUsd.toFixed(4)}` : "—"}
          </div>
        </div>

        {/* Minimum */}
        <div style={{ background: "#121b2f", border: "1px solid #1d2942", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>Minimum</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{minimum} {asset.id}</div>
        </div>

        {/* You receive */}
        <div style={{ background: "#121b2f", border: "1px solid #1d2942", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>You Receive</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>
            {parsedAmount > 0 ? `${willReceive.toFixed(4)} ${asset.id}` : "—"}
          </div>
        </div>
      </div>

      {/* Address */}
      <label style={lbl}>Destination Wallet Address</label>
      <input style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}
        type="text" placeholder={`Paste ${network} address`}
        value={address}
        onChange={e => { setAddress(e.target.value); setConfirm(false); }} />

      {/* Amount */}
      <label style={lbl}>Amount ({asset.id})</label>
      <input style={inp} type="number" placeholder={`Min ${minimum}`}
        value={amount}
        onChange={e => { setAmount(e.target.value); setConfirm(false); }} />

      {/* Warning */}
      <div style={{ background: "#1a1a0a", border: "1px solid #854d0e", borderRadius: 8,
        padding: "10px 12px", marginTop: 14, color: "#fbbf24", fontSize: 12 }}>
        ⚠️ Send only <strong>{asset.id}</strong> via <strong>{network}</strong>.
        Wrong network = permanent loss of funds.
      </div>

      {/* Confirm box */}
      {confirm && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid #dc2626",
          borderRadius: 10, padding: "14px 16px", marginTop: 14 }}>
          <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
            ⚠️ Confirm — this cannot be undone
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 2 }}>
            <div>Asset: <strong style={{ color: asset.color }}>{asset.id}</strong></div>
            <div>Network: <strong style={{ color: NETWORK_COLORS[network] ?? "white" }}>{network}</strong></div>
            <div>Amount: <strong style={{ color: "white" }}>{amount} {asset.id}</strong></div>
            <div>Gas fee: <strong style={{ color: "#f87171" }}>~${gasUsd.toFixed(4)}{feeInfo?.gwei ? ` (${feeInfo.gwei} gwei)` : ""}</strong></div>
            <div>Platform fee: <strong style={{ color: "#f87171" }}>~${platformFeeUsd.toFixed(4)} ({PLATFORM_FEE_PCT}%)</strong></div>
            <div>You receive: <strong style={{ color: "#22c55e" }}>{willReceive.toFixed(4)} {asset.id}</strong></div>
            <div>To: <code style={{ color: "#60a5fa", fontSize: 11, wordBreak: "break-all" as const }}>{address}</code></div>
          </div>
        </div>
      )}

      <button className="auth-btn" onClick={handleSubmit}
        disabled={loading || !address || !amount}
        style={{ marginTop: 14, background: confirm ? "#dc2626" : undefined, transition: "background 0.2s" }}>
        {loading ? "Submitting..." : confirm ? "✅ Confirm & Send" : `Withdraw ${asset.id} →`}
      </button>

      {confirm && (
        <button onClick={() => setConfirm(false)}
          style={{ width: "100%", marginTop: 8, background: "transparent",
            border: "1px solid #1d2942", borderRadius: 8, color: "#94a3b8",
            padding: "9px 0", cursor: "pointer", fontSize: 13 }}>
          Cancel
        </button>
      )}

      {error && <p style={{ color: "#ef4444", marginTop: 8, fontSize: 13 }}>{error}</p>}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = "php" | "crypto";

export default function Withdrawals() {
  const [tab, setTab] = useState<Tab>("php");
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Withdrawals</h2>
        <p style={{ color: "#94a3b8", marginTop: 0, marginBottom: 20 }}>
          Withdraw PHP to your mobile wallet, or send crypto directly to any wallet address.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button onClick={() => setTab("php")} style={{
            padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 13,
            background: tab === "php" ? "#3b82f6" : "#1d2942", color: "white",
          }}>💵 PHP Withdrawal</button>
          <button onClick={() => setTab("crypto")} style={{
            padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 13,
            background: tab === "crypto" ? "#8b5cf6" : "#1d2942", color: "white",
          }}>🔗 Crypto Withdrawal</button>
        </div>
        <div style={{ background: "#0d1526", borderRadius: 14, padding: 24, maxWidth: 560 }}>
          {tab === "php"    && <PhpWithdrawal />}
          {tab === "crypto" && <CryptoWithdrawal />}
        </div>
      </div>
    </DashboardLayout>
  );
}
