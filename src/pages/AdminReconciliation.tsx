import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";

export default function AdminReconciliation() {
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState(null);

  const loadQueue = useCallback(() => {
    setError("");
    fetch("/api/v1/admin/reconciliation/queue", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setQueue(d.data);
        else setError(d?.message || "Failed to load queue.");
      })
      .catch(() => setError("Failed to load queue."));
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleAction = async (id, action) => {
    setActioningId(id);
    try {
      const res = await fetch(`/api/v1/admin/reconciliation/queue/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data?.success) {
        setError(data?.message || `Failed to ${action} item.`);
      }
      loadQueue();
    } catch {
      setError(`Failed to ${action} item.`);
    } finally {
      setActioningId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Reconciliation Queue</h2>
        <div className="card">
          <h3>Pending Corrections</h3>

          {error && <p style={{ color: "#f87171" }}>{error}</p>}

          {queue === null ? (
            <p style={{ color: "#94a3b8" }}>Loading...</p>
          ) : queue.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No pending items. Everything is in sync.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                  <th>User</th>
                  <th>Currency</th>
                  <th>Ledger</th>
                  <th>On-Chain</th>
                  <th>Drift</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item._id} style={{ borderTop: "1px solid #1e293b" }}>
                    <td>{item.userId}</td>
                    <td>{item.currency}</td>
                    <td>{item.ledgerBalance}</td>
                    <td>{item.onChainBalance}</td>
                    <td style={{ color: item.drift < 0 ? "#f59e0b" : "#22c55e" }}>
                      {item.drift}
                    </td>
                    <td style={{ maxWidth: 320, fontSize: "0.85em", color: "#94a3b8" }}>
                      {(item.policyReasons || []).join("; ")}
                    </td>
                    <td>
                      <button
                        disabled={actioningId === item._id}
                        onClick={() => handleAction(item._id, "approve")}
                        style={{ marginRight: 8, background: "#22c55e", color: "#000" }}
                      >
                        Approve
                      </button>
                      <button
                        disabled={actioningId === item._id}
                        onClick={() => handleAction(item._id, "reject")}
                        style={{ background: "#f87171", color: "#000" }}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
