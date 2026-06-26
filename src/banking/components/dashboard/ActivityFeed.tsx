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
          }, ...prev.slice(0,19)]);
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
        {toasts.map(toast => (
          <div key={toast.id} style={{
            background:
toast.type==="CREDITED"
? "#16a34a"
: toast.type==="WITHDRAWAL"
? "#2563eb"
: "#dc2626",
            color: "#fff",
            borderRadius: 8,
            padding: "10px 14px",
            minWidth: 260,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            animation: "slideIn 0.3s ease",
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {
toast.type==="CREDITED"
? "✅ Deposit Verified"
: toast.type==="WITHDRAWAL"
? "💸 Withdrawal Requested"
: "⚠️ Deposit Flagged"
}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              <strong>PHP {toast.amount?.toLocaleString()}</strong> — Ref: {toast.referenceId}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              👤 {toast.userName} ({toast.userEmail})
            </div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>
              From: {toast.sender} via {toast.channel}
            </div>
            {toast.flagReason && (
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                Reason: {toast.flagReason}
              </div>
            )}
          </div>
        ))}
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
