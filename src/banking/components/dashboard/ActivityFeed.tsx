import { useEffect, useState } from "react";

type Transaction = {
  type?: string;
  amount?: number;
  currency?: string;
  status?: string;
  reference?: string;
};

type Toast = {
  id: number;
  type: string;
  amount: number;
  referenceId: string;
  sender: string;
  channel: string;
  flagReason?: string;
  userEmail?: string;
  userName?: string;
};

type Props = {
  data: Transaction[];
};

const TOAST_STYLE: Record<string, { bg: string; label: string }> = {
  CREDITED: { bg: "#16a34a", label: "✅ Deposit Verified" },
  WITHDRAWAL: { bg: "#2563eb", label: "💸 Withdrawal Requested" },
  WITHDRAWAL_COMPLETED: { bg: "#16a34a", label: "✅ Withdrawal Completed" },
  WITHDRAWAL_FAILED: { bg: "#dc2626", label: "❌ Withdrawal Failed" },
  FLAGGED: { bg: "#dc2626", label: "⚠️ Deposit Flagged" },
};

export default function ActivityFeed({ data = [] }: Props) {
  const [activity, setActivity] = useState<Transaction[]>(data);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const es = new EventSource("/api/v1/dashboard/stream", { withCredentials: true });

    es.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);

        // Flash toast for credited deposit
        if (type === "deposit.credited") {
          const toast: Toast = {
            id: Date.now(),
            type: "CREDITED",
            amount: data.amount,
            referenceId: data.entityId,
            sender: data.sender || "unknown",
            channel: data.channel || "MAYA",
            userEmail: data.userEmail || "unknown",
            userName: data.userName || "unknown",
          };
          showToast(toast);

          // Prepend to activity feed
          setActivity(prev => [{
            type: "deposit",
            amount: data.amount,
            currency: "PHP",
            status: "credited",
            reference: data.entityId,
          }, ...prev.slice(0, 19)]);
        }

        // Flash warning for flagged deposit
        if (type === "deposit.flagged") {
          const toast: Toast = {
            id: Date.now(),
            type: "FLAGGED",
            amount: data.raw?.amount || 0,
            referenceId: data.entityId || "N/A",
            sender: data.raw?.sender || "unknown",
            channel: data.raw?.source || "UNKNOWN",
            flagReason: data.reason,
          };
          showToast(toast);
        }

        if (type === "withdrawal.created") {
          const toast: Toast = {
            id: Date.now(),
            type: "WITHDRAWAL",
            amount: data.amount,
            referenceId: data.entityId,
            sender: data.destinationAddress || "",
            channel: data.asset || "PHP",
            userEmail: data.userEmail || "unknown",
            userName: data.userName || "unknown",
          };

          showToast(toast);

          setActivity(prev => [{
            type: "withdrawal",
            amount: data.amount,
            currency: data.asset,
            status: data.status,
            reference: data.entityId,
          }, ...prev.slice(0, 19)]);
        }

        // Withdrawal successfully settled on-chain — update the existing
        // activity row in place rather than adding a duplicate, since
        // withdrawal.created already added it.
        if (type === "withdrawal.completed") {
          setActivity(prev => prev.map(a =>
            a.reference === data.entityId
              ? { ...a, status: "completed" }
              : a
          ));

          showToast({
            id: Date.now(),
            type: "WITHDRAWAL_COMPLETED",
            amount: data.amount,
            referenceId: data.entityId,
            sender: data.txHash || "",
            channel: data.asset || "",
          });
        }

        // Withdrawal failed (debit failure or on-chain send failure) —
        // same in-place update pattern as completed.
        if (type === "withdrawal.failed") {
          setActivity(prev => prev.map(a =>
            a.reference === data.entityId
              ? { ...a, status: "failed" }
              : a
          ));

          showToast({
            id: Date.now(),
            type: "WITHDRAWAL_FAILED",
            amount: data.amount,
            referenceId: data.entityId,
            sender: data.error || "unknown error",
            channel: data.asset || "",
          });
        }

      } catch (err) {
        console.error("[ActivityFeed] SSE parse error:", err);
      }
    };

    es.onerror = () => {
      console.warn("[ActivityFeed] SSE connection lost — will retry");
    };

    return () => es.close();
  }, []);

  const showToast = (toast: Toast) => {
    setToasts(prev => [toast, ...prev]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, 6000);
  };

  return (
    <div className="card" style={{ position: "relative" }}>

      {/* Toast notifications */}
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 99, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map(toast => {
          const style = TOAST_STYLE[toast.type] || { bg: "#dc2626", label: toast.type };
          return (
            <div key={toast.id} style={{
              background: style.bg,
              color: "#fff",
              borderRadius: 8,
              padding: "10px 14px",
              minWidth: 260,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              animation: "slideIn 0.3s ease",
            }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {style.label}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <strong>{toast.channel === "PHP" || !toast.channel ? "PHP" : toast.channel} {toast.amount?.toLocaleString()}</strong> — Ref: {toast.referenceId}
              </div>
              {(toast.userName || toast.userEmail) && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  👤 {toast.userName || "unknown"} ({toast.userEmail || "unknown"})
                </div>
              )}
              {toast.sender && (
                <div style={{ fontSize: 11, opacity: 0.85 }}>
                  {toast.type === "WITHDRAWAL_COMPLETED"
                    ? `Tx: ${toast.sender}`
                    : toast.type === "WITHDRAWAL_FAILED"
                    ? `Error: ${toast.sender}`
                    : `From: ${toast.sender}${toast.channel ? ` via ${toast.channel}` : ""}`}
                </div>
              )}
              {toast.flagReason && (
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                  Reason: {toast.flagReason}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2>Recent Activity</h2>

      {activity.length === 0 && <div>No recent activity</div>}

      {activity.map((tx, index) => (
        <div key={tx.reference || index} className="activity-item">
          <strong>{(tx.type || "UNKNOWN").toUpperCase()}</strong>
          {" "}{tx.amount || 0} {tx.currency || "PHP"}
          <br />
          <small>{tx.status || "pending"}</small>
        </div>
      ))}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
