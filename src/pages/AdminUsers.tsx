import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";

interface AdminUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "user" | "admin";
  kycTier: string;
  isVerified: boolean;
  createdAt: string;
}

const api = (url: string, opts: RequestInit = {}) =>
  fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then((r) => r.json());

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api("/api/v1/admin/users");
    if (res.success) {
      setUsers(res.users);
    } else {
      setError(res.error || "Failed to load users");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePromote = async (user: AdminUser) => {
    if (!window.confirm(`Grant admin access to ${user.email}? This gives full access to deposits, withdrawals, and user management.`)) {
      return;
    }
    setActingId(user._id);
    const res = await api(`/api/v1/admin/users/${user._id}/promote`, { method: "POST" });
    if (!res.success) {
      alert(res.error || "Failed to promote user");
    }
    await load();
    setActingId(null);
  };

  const handleDemote = async (user: AdminUser) => {
    if (!window.confirm(`Revoke admin access from ${user.email}?`)) {
      return;
    }
    setActingId(user._id);
    const res = await api(`/api/v1/admin/users/${user._id}/demote`, { method: "POST" });
    if (!res.success) {
      alert(res.error || "Failed to demote user");
    }
    await load();
    setActingId(null);
  };

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <div style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>
          User Management
        </h1>
        <p style={{ fontSize: "13px", color: "var(--color-text-tertiary)", marginBottom: "20px" }}>
          Promote a regular account to admin, or revoke admin access.
        </p>

        <input
          type="text"
          placeholder="Search by name or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: "360px",
            padding: "8px 12px",
            marginBottom: "16px",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-primary)",
            fontSize: "13px",
          }}
        />

        {error && (
          <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px" }}>
            {error}
          </div>
        )}

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
              Loading users...
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-background-tertiary)" }}>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: "12px", color: "var(--color-text-tertiary)" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: "12px", color: "var(--color-text-tertiary)" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: "12px", color: "var(--color-text-tertiary)" }}>KYC</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: "12px", color: "var(--color-text-tertiary)" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: "12px", color: "var(--color-text-tertiary)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u._id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "12px 16px", fontSize: "13px" }}>
                      {u.firstName} {u.lastName}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", fontFamily: "monospace" }}>
                      {u.email}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-tertiary)" }}>
                      {u.kycTier}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "99px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: u.role === "admin" ? "#14532d" : "var(--color-background-tertiary)",
                          color: u.role === "admin" ? "#4ade80" : "var(--color-text-secondary)",
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {u.role === "admin" ? (
                        <button
                          disabled={actingId === u._id}
                          onClick={() => handleDemote(u)}
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid #f87171",
                            background: "transparent",
                            color: "#f87171",
                            cursor: "pointer",
                          }}
                        >
                          Revoke admin
                        </button>
                      ) : (
                        <button
                          disabled={actingId === u._id}
                          onClick={() => handlePromote(u)}
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid #60a5fa",
                            background: "transparent",
                            color: "#60a5fa",
                            cursor: "pointer",
                          }}
                        >
                          Make admin
                        </button>
                      )}
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
