import DashboardLayout from "../banking/components/DashboardLayout";
import PendingWithdrawals from "../banking/components/PendingWithdrawals";
import { useState, useEffect } from "react";

interface ProcessingDeposit {
  txHash: string;
  chain: string;
  token: string;
  amount: string;
  confirmations: number;
  requiredConfirmations: number;
  currentStage: string;
  status: string;
  detectedAt: string;
}

const STAGE_LABEL: Record<string, string> = {
  ConfirmationWorker: "Waiting for confirmations",
  DepositProcessor: "Verifying deposit",
  WalletCreditWorker: "Crediting wallet",
  LedgerWorker: "Finalizing",
  DashboardWorker: "Finalizing",
};

function shortHash(hash: string) {
  return hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;
}

export default function Activity() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<ProcessingDeposit[]>([]);

  useEffect(() => {
    fetch("/api/v1/transactions", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setTxs(d.transactions || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProcessing() {
      try {
        const res = await fetch("/api/v1/deposit/crypto/processing", {
          credentials: "include",
        });
        const data = await res.json();
        if (!cancelled && data.success) {
          setProcessing(data.processing || []);
        }
      } catch {
        // silent — this is a background polling refresh
      }
    }

    loadProcessing();
    const interval = setInterval(loadProcessing, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Activity</h2>
        <PendingWithdrawals />

        {processing.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#facc15",
                  display: "inline-block",
                }}
              />
              Confirmation Zone
            </div>

            {processing.map((p) => {
              const pct = Math.min(
                100,
                Math.round(
                  (p.confirmations / Math.max(1, p.requiredConfirmations)) * 100
                )
              );
              return (
                <div
                  key={p.txHash}
                  className="activity-item"
                  style={{ paddingBottom: 12 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <strong>
                      {p.chain.toUpperCase()} · {p.token}
                    </strong>
                    <span style={{ color: "#facc15" }}>+{p.amount}</span>
                  </div>
                  <div
                    style={{
                      color: "#94a3b8",
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    {shortHash(p.txHash)} ·{" "}
                    {STAGE_LABEL[p.currentStage] || p.currentStage}
                  </div>
                  <div
                    style={{
                      background: "#1d2942",
                      borderRadius: 6,
                      height: 6,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "#facc15",
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 11,
                      marginTop: 4,
                    }}
                  >
                    {p.confirmations}/{p.requiredConfirmations} confirmations
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="card">
          {loading && <p>Loading...</p>}
          {!loading && txs.length === 0 && (
            <p style={{ color: "#94a3b8" }}>No transactions yet.</p>
          )}
          {txs.map((tx: any, i) => (
            <div key={i} className="activity-item">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{(tx.type || "UNKNOWN").toUpperCase()}</strong>
                <span
                  style={{
                    color: tx.direction === "in" ? "#22c55e" : "#ef4444",
                  }}
                >
                  {tx.direction === "in" ? "+" : "-"}
                  {tx.amount} {tx.currency}
                </span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                {tx.referenceNumber} · {tx.status} ·{" "}
                {new Date(tx.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
