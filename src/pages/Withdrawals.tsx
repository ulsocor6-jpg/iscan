import DashboardLayout from "../banking/components/DashboardLayout";
import { useState } from "react";

const inp = {
  width: "100%", padding: 10, borderRadius: 8,
  border: "1px solid #1d2942", background: "#121b2f",
  color: "white", marginTop: 4, boxSizing: "border-box" as const,
};

export default function Withdrawals() {
  const [channel, setChannel]   = useState("MAYA");
  const [amount, setAmount]     = useState("");
  const [account, setAccount]   = useState("");
  const [name, setName]         = useState("");
  const [result, setResult]     = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleCashOut() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/payment/cashout", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          channel,
          accountNumber: account,
          receiverName: name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Withdrawals</h2>
        <p style={{ color: "#94a3b8", marginTop: 0 }}>
          Withdraw PHP to your Maya or bank account. Processed within 24 hours.
        </p>

        <div style={{ background: "#0d1526", borderRadius: 12, padding: 24, maxWidth: 500 }}>

          {!result ? (
            <>
              {/* Channel */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {["MAYA", "BANK", "GCASH"].map(c => (
                  <button key={c} onClick={() => setChannel(c)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                    cursor: "pointer", fontWeight: 600, fontSize: 13,
                    background: channel === c ? "#3b82f6" : "#1d2942", color: "white",
                  }}>
                    {c === "MAYA" ? "🟣 Maya" : c === "BANK" ? "🏦 Bank" : "💙 GCash"}
                  </button>
                ))}
              </div>

              <label style={{ color: "#94a3b8", fontSize: 12 }}>Amount (PHP)</label>
              <input style={inp} type="number" placeholder="Min ₱100"
                value={amount} onChange={e => setAmount(e.target.value)} />

              <label style={{ color: "#94a3b8", fontSize: 12, marginTop: 12, display: "block" }}>
                {channel === "BANK" ? "Account Number" : "Mobile Number"}
              </label>
              <input style={inp} type="text"
                placeholder={channel === "BANK" ? "e.g. 1234567890" : "e.g. 09XXXXXXXXX"}
                value={account} onChange={e => setAccount(e.target.value)} />

              <label style={{ color: "#94a3b8", fontSize: 12, marginTop: 12, display: "block" }}>
                Account Name
              </label>
              <input style={inp} type="text" placeholder="Full name"
                value={name} onChange={e => setName(e.target.value)} />

              <div style={{ background: "#1a1a0a", border: "1px solid #854d0e",
                borderRadius: 8, padding: "10px 12px", marginTop: 16, marginBottom: 16,
                color: "#fbbf24", fontSize: 12 }}>
                ⚠️ Fee: 1.5% • Minimum ₱100 • Processed within 24 hours
              </div>

              <button className="auth-btn" onClick={handleCashOut}
                disabled={loading || !amount || !account || !name}>
                {loading ? "Submitting..." : "Request Withdrawal"}
              </button>

              {error && <p style={{ color: "#ef4444", marginTop: 8, fontSize: 13 }}>{error}</p>}
            </>
          ) : (
            <div style={{ background: "#0a1f0a", borderRadius: 8, padding: 16 }}>
              <p style={{ color: "#22c55e", margin: "0 0 8px", fontWeight: 700 }}>
                ✅ Withdrawal Request Submitted!
              </p>
              <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 4px" }}>
                Ref: <strong style={{ color: "white" }}>{result.referenceId}</strong>
              </p>
              <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 4px" }}>
                Amount: <strong style={{ color: "white" }}>₱{result.amount}</strong>
                {" "}→ Net: <strong style={{ color: "#22c55e" }}>₱{result.netAmount}</strong>
                {" "}(Fee: ₱{result.fee})
              </p>
              <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                {result.message}
              </p>
              <button onClick={() => { setResult(null); setAmount(""); setAccount(""); setName(""); }}
                style={{ marginTop: 16, background: "transparent", border: "1px solid #1d2942",
                  borderRadius: 8, color: "#94a3b8", padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
                New Withdrawal
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
