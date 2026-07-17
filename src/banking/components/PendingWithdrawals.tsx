import { useEffect, useState } from "react";

interface PendingItem {
  referenceNumber: string;
  amount: number;
  netAmount: number;
  expiresAt: string | null;
}

function timeLeft(expiresAt: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "releasing soon";
  const mins = Math.ceil(ms / 60000);
  return `~${mins} min left`;
}

export default function PendingWithdrawals() {
  const [items, setItems] = useState<PendingItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/v1/transactions", { credentials: "include" });
        const data = await res.json();
        const cashouts = (data.transactions || []).filter(
          (tx: any) => (tx.type || "").toLowerCase() === "cashout"
        );

        const checked = await Promise.all(
          cashouts.slice(0, 10).map(async (tx: any) => {
            try {
              const r = await fetch(
                `/api/v1/payment/cashout/${tx.referenceNumber}/status`,
                { credentials: "include" }
              );
              const s = await r.json();
              return { tx, s };
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          const pending = checked
            .filter((c: any) => c && c.s?.status === "pending_review")
            .map((c: any) => ({
              referenceNumber: c.tx.referenceNumber,
              amount: c.tx.amount,
              netAmount: c.s.netAmount,
              expiresAt: c.s.expiresAt,
            }));
          setItems(pending);
        }
      } catch {
        // silent — background check, no need to surface fetch errors
      }
    }

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16, border: "1px solid rgba(245,158,11,0.3)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#f59e0b" }}>
        ⏳ Pre-debited — awaiting admin release
      </div>
      {items.map((item) => (
        <div key={item.referenceNumber} className="activity-item" style={{ paddingBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>₱{(item.netAmount ?? item.amount).toFixed(2)} held</strong>
            <span style={{ color: "#f59e0b", fontSize: 12 }}>{timeLeft(item.expiresAt)}</span>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            {item.referenceNumber} · already debited from your balance, waiting for admin to send it
          </div>
        </div>
      ))}
    </div>
  );
}
