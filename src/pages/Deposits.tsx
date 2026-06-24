import DashboardLayout from "../banking/components/DashboardLayout";
import { useState } from "react";

const API_BASE = "/api/v1";

const CHAINS = [
  {
    id: "tron",
    label: "TRON",
    token: "USDT",
    symbol: "USDT-TRC20",
    icon: "🔴",
    color: "#ef4444",
    warning: "Send only USDT (TRC20) to this address. Other assets will be lost.",
  },
  {
    id: "ronin",
    label: "Ronin",
    token: "FLOWER",
    symbol: "FLOWER",
    icon: "🗡️",
    color: "#2563eb",
    warning: "Send only FLOWER on Ronin to this address.",
  },
  {
    id: "base",
    label: "Base",
    token: "USDC",
    symbol: "USDC",
    icon: "🔵",
    color: "#3b82f6",
    warning: "Send only USDC on Base to this address.",
  },
];

const inp = {
  width: "100%", padding: 10, borderRadius: 8,
  border: "1px solid #1d2942", background: "#121b2f",
  color: "white", marginTop: 4, boxSizing: "border-box" as const,
};

function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=0d1526&color=ffffff&margin=10`;
  return (
    <img src={url} alt="QR Code" width={size} height={size}
      style={{ borderRadius: 8, border: "1px solid #1d2942" }} />
  );
}


function PhpCashIn() {
  const [channel, setChannel] = useState("MAYA");
  const [amount, setAmount]   = useState("");
  const [result, setResult]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [copied, setCopied]   = useState(false);

  async function handleRequest() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/deposit/request", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), channel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const channelNum = channel === "MAYA"
    ? result?.instructions?.maya
    : result?.instructions?.bank;

  return (
    <div style={{ background: "#0d1526", borderRadius: 12, padding: 24, maxWidth: 500 }}>
      {/* Channel selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["MAYA", "MARIBANK"].map(c => (
          <button key={c} onClick={() => { setChannel(c); setResult(null); setError(""); }}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
              background: channel === c ? "#3b82f6" : "#1d2942", color: "white",
            }}>
            {c === "MAYA" ? "🟣 Maya" : "🏦 Maribank"}
          </button>
        ))}
      </div>

      {!result ? (
        <>
          <label style={{ color: "#94a3b8", fontSize: 12 }}>Amount (PHP)</label>
          <input style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #1d2942",
            background: "#121b2f", color: "white", marginTop: 4, marginBottom: 16,
            boxSizing: "border-box" as const }}
            type="number" placeholder="Min ₱20" value={amount}
            onChange={e => setAmount(e.target.value)} />
          <button className="auth-btn" onClick={handleRequest} disabled={loading || !amount}>
            {loading ? "Generating..." : "Generate Reference"}
          </button>
          {error && <p style={{ color: "#ef4444", marginTop: 8, fontSize: 13 }}>{error}</p>}
        </>
      ) : (
        <div>
          <div style={{ background: "#0a1f0a", borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <p style={{ color: "#22c55e", margin: "0 0 8px", fontWeight: 700 }}>✅ Reference Generated!</p>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>Reference ID</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <code style={{ color: "#3b82f6", fontSize: 14, fontWeight: 700 }}>{result.referenceId}</code>
              <button onClick={() => copy(result.referenceId)} style={{
                background: copied ? "#22c55e" : "#1d2942", border: "none",
                borderRadius: 6, color: "white", padding: "4px 10px", cursor: "pointer", fontSize: 12,
              }}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>
              Send exactly <strong style={{ color: "white" }}>₱{result.amount}</strong> to:
            </div>
            <div style={{ color: "white", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              📱 {channelNum}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>
              Account Name: <strong style={{ color: "white" }}>{result.instructions?.name}</strong>
            </div>
            <div style={{ background: "#1a1a0a", border: "1px solid #854d0e", borderRadius: 8,
              padding: "8px 12px", color: "#fbbf24", fontSize: 12, marginTop: 8 }}>
              ⚠️ {result.instructions?.message}
            </div>
          </div>
          <button onClick={() => { setResult(null); setAmount(""); }}
            style={{ background: "transparent", border: "1px solid #1d2942",
              borderRadius: 8, color: "#94a3b8", padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
            New Deposit
          </button>
        </div>
      )}
    </div>
  );
}

export default function Deposits() {
  const [selectedChain, setSelectedChain] = useState(CHAINS[0]);
  const [addresses, setAddresses]         = useState<Record<string, any>>({});
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [copied, setCopied]               = useState(false);

  const current = addresses[selectedChain.id];

  async function handleGenerate() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/onramp/deposit-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ chain: selectedChain.id, token: selectedChain.token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate address");
      setAddresses(prev => ({ ...prev, [selectedChain.id]: data.data }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(addr: string) {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Deposits</h2>

        {/* Chain selector */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" as const }}>
          {CHAINS.map(c => (
            <button key={c.id} onClick={() => { setSelectedChain(c); setError(""); }}
              style={{
                padding: "10px 20px", borderRadius: 8, border: "none",
                cursor: "pointer", fontWeight: 600, fontSize: 14,
                background: selectedChain.id === c.id ? c.color : "#1d2942",
                color: "white", display: "flex", alignItems: "center", gap: 6,
              }}>
              {c.icon} {c.label}
              <span style={{ fontSize: 11, opacity: 0.8 }}>({c.symbol})</span>
            </button>
          ))}
        </div>

        {/* Deposit card */}
        <div style={{ background: "#0d1526", borderRadius: 12, padding: 24, maxWidth: 500 }}>
          <h3 style={{ margin: "0 0 4px", color: "white" }}>
            {selectedChain.icon} {selectedChain.label} Deposit
          </h3>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 0, marginBottom: 20 }}>
            Generate a {selectedChain.symbol} deposit address.
          </p>

          {!current ? (
            <button className="auth-btn" onClick={handleGenerate} disabled={loading}>
              {loading ? "Generating..." : `Generate ${selectedChain.symbol} Address`}
            </button>
          ) : (
            <div>
              {/* QR */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <QRCode value={current.address} size={180} />
              </div>

              {/* Address */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4 }}>
                  {selectedChain.symbol} Deposit Address
                </div>
                <div style={{
                  ...inp, display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 8, padding: "10px 12px",
                }}>
                  <code style={{ color: selectedChain.color, fontSize: 11, wordBreak: "break-all" as const, flex: 1 }}>
                    {current.address}
                  </code>
                  <button onClick={() => handleCopy(current.address)} style={{
                    background: copied ? "#22c55e" : "#1d2942",
                    border: "none", borderRadius: 6, color: "white",
                    padding: "4px 10px", cursor: "pointer", fontSize: 12, flexShrink: 0,
                  }}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Warning */}
              <div style={{
                background: "#1a1a0a", border: "1px solid #854d0e",
                borderRadius: 8, padding: "10px 12px", marginBottom: 16,
                color: "#fbbf24", fontSize: 12,
              }}>
                ⚠️ {selectedChain.warning}
              </div>

              {/* Expiry */}
              {current.expiresAt && (
                <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 16 }}>
                  Expires: {new Date(current.expiresAt).toLocaleString()}
                </div>
              )}

              {/* Generate new */}
              <button onClick={() => setAddresses(prev => ({ ...prev, [selectedChain.id]: null }))}
                style={{
                  background: "transparent", border: "1px solid #1d2942",
                  borderRadius: 8, color: "#94a3b8", padding: "8px 16px",
                  cursor: "pointer", fontSize: 13,
                }}>
                Generate New Address
              </button>
            </div>
          )}

          {error && <p style={{ color: "#ef4444", marginTop: 12, fontSize: 13 }}>{error}</p>}
        </div>

        {/* PHP Cash In Section */}
        <div style={{ marginTop: 32 }}>
          <h3 style={{ color: "white", marginBottom: 16 }}>💵 PHP Cash In (Maya / Maribank)</h3>
          <PhpCashIn />
        </div>
      </div>
    </DashboardLayout>
  );
}
