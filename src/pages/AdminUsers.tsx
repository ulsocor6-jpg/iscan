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

interface LedgerEntry {
  _id: string;
  referenceId: string;
  transactionType: string;
  debit: number;
  credit: number;
  currency: string;
  status: string;
  description: string;
  counterpartyAddress: string | null;
  createdAt: string;
}

interface SystemEvent {
  _id: string;
  type: string;
  entityId: string | null;
  userId: string | null;
  data: Record<string, any>;
  timestamp: string;
}

interface UserDetails {
  user: AdminUser & { linkedWallets?: any[] };
  balance: Record<string, number>;
  wallet: {
    iscanAddress?: string;
    balances?: Record<string, number>;
    chainAddresses?: { chain: string; address: string; usdtBalance?: number; usdcBalance?: number }[];
  } | null;
  activity: LedgerEntry[];
  events: SystemEvent[];
  onchainBalances?: Record<string, { address: string; native?: number; USDT?: number; USDC?: number; error?: string }>;
}

const api = (url: string, opts: RequestInit = {}) =>
  fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then((r) => r.json());

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function UserDetailPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api(`/api/v1/admin/users/${userId}/details`)
      .then((res) => {
        if (res.success) {
          setData(res);
        } else {
          setError(res.error || "Failed to load user details");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load user details");
        setLoading(false);
      });
  }, [userId]);

  const handleImpersonate = async () => {
    if (!data) return;
    if (
      !window.confirm(
        `Enter ${data.user.email}'s account? You'll see exactly what they see, for up to 30 minutes. This is logged.`
      )
    ) {
      return;
    }
    setImpersonating(true);
    const res = await api(`/api/v1/admin/users/${userId}/impersonate`, { method: "POST" });
    if (!res.success) {
      alert(res.error || "Failed to enter account");
      setImpersonating(false);
      return;
    }
    window.location.href = "/dashboard";
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "60px",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-primary)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          width: "640px",
          maxWidth: "92vw",
          maxHeight: "80vh",
          overflowY: "auto",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700 }}>
              {data ? `${data.user.firstName} ${data.user.lastName}` : "Loading..."}
            </h2>
            {data && (
              <p style={{ fontSize: "13px", color: "var(--color-text-tertiary)", fontFamily: "monospace" }}>
                {data.user.email}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            {data && (
              <button
                disabled={impersonating}
                onClick={handleImpersonate}
                style={{
                  fontSize: "12px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #fbbf24",
                  background: "transparent",
                  color: "#fbbf24",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {impersonating ? "Entering..." : "👁 Enter as user"}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-text-tertiary)",
                fontSize: "16px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
            Loading details...
          </div>
        )}

        {error && (
          <div style={{ color: "#f87171", fontSize: "13px" }}>{error}</div>
        )}

        {data && (
          <>
            {/* Balance summary */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "10px",
                  background: "var(--color-background-secondary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "4px" }}>
                  Ledger Balance
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>
                  ₱{(data.balance.PHP || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                {Object.entries(data.balance)
                  .filter(([cur, amt]) => cur !== "PHP" && amt !== 0)
                  .map(([cur, amt]) => (
                    <div key={cur} style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginTop: "2px" }}>
                      {amt.toLocaleString(undefined, { maximumFractionDigits: 6 })} {cur}
                    </div>
                  ))}
              </div>
              <div
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "10px",
                  background: "var(--color-background-secondary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "4px" }}>
                  KYC Tier
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, textTransform: "capitalize" }}>
                  {data.user.kycTier}
                </div>
              </div>
            </div>

            {/* Wallet / chain addresses */}
            {data.wallet && (
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", color: "var(--color-text-secondary)" }}>
                  Wallet — live on-chain balances
                </h3>
                <div style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-tertiary)", marginBottom: "8px" }}>
                  {data.wallet.iscanAddress}
                </div>
                {data.wallet.chainAddresses && data.wallet.chainAddresses.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ color: "var(--color-text-tertiary)" }}>
                        <th style={{ textAlign: "left", padding: "4px 0" }}>Chain</th>
                        <th style={{ textAlign: "left", padding: "4px 0" }}>Address</th>
                        <th style={{ textAlign: "right", padding: "4px 0" }}>Native</th>
                        <th style={{ textAlign: "right", padding: "4px 0" }}>USDT</th>
                        <th style={{ textAlign: "right", padding: "4px 0" }}>USDC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.wallet.chainAddresses.map((c, i) => {
                        const onchain = data.onchainBalances?.[c.chain?.toUpperCase?.()];
                        return (
                          <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "4px 0" }}>{c.chain}</td>
                            <td style={{ padding: "4px 0", fontFamily: "monospace" }}>
                              {c.address.slice(0, 8)}...{c.address.slice(-6)}
                            </td>
                            {!onchain ? (
                              <td colSpan={3} style={{ padding: "4px 0", textAlign: "right", color: "var(--color-text-tertiary)" }}>
                                loading...
                              </td>
                            ) : onchain.error ? (
                              <td colSpan={3} style={{ padding: "4px 0", textAlign: "right", color: "#f87171" }}>
                                {onchain.error}
                              </td>
                            ) : (
                              <>
                                <td style={{ padding: "4px 0", textAlign: "right" }}>
                                  {onchain.native != null ? onchain.native.toFixed(5) : "—"}
                                </td>
                                <td style={{ padding: "4px 0", textAlign: "right" }}>
                                  {onchain.USDT != null ? onchain.USDT.toFixed(4) : "—"}
                                </td>
                                <td style={{ padding: "4px 0", textAlign: "right" }}>
                                  {onchain.USDC != null ? onchain.USDC.toFixed(4) : "—"}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "6px" }}>
                  Pulled live via RPC (balanceOf), not the cached ledger — reflects what's actually on-chain right now.
                </div>
              </div>
            )}

            {/* Activity */}
            <div>
              <h3 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", color: "var(--color-text-secondary)" }}>
                Recent Activity (last {data.activity.length})
              </h3>
              {data.activity.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>No activity yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ color: "var(--color-text-tertiary)" }}>
                      <th style={{ textAlign: "left", padding: "6px 0" }}>Type</th>
                      <th style={{ textAlign: "right", padding: "6px 0" }}>Amount</th>
                      <th style={{ textAlign: "left", padding: "6px 0" }}>Status</th>
                      <th style={{ textAlign: "right", padding: "6px 0" }}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activity.map((tx) => (
                      <tr key={tx._id} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "6px 0" }}>{tx.transactionType}</td>
                        <td
                          style={{
                            padding: "6px 0",
                            textAlign: "right",
                            color: tx.credit > 0 ? "#4ade80" : "#f87171",
                            fontFamily: "monospace",
                          }}
                        >
                          {tx.credit > 0 ? "+" : "-"}
                          {(tx.credit > 0 ? tx.credit : tx.debit).toLocaleString()} {tx.currency}
                        </td>
                        <td style={{ padding: "6px 0" }}>{tx.status}</td>
                        <td style={{ padding: "6px 0", textAlign: "right", color: "var(--color-text-tertiary)" }}>
                          {timeAgo(tx.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* System event timeline — logins, admin actions, impersonation, pipeline events */}
            <div style={{ marginTop: "20px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", color: "var(--color-text-secondary)" }}>
                System Event Log ({data.events.length})
              </h3>
              {data.events.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>No system events recorded yet.</div>
              ) : (
                <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: "8px" }}>
                  {data.events.map((ev) => (
                    <div
                      key={ev._id}
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--color-border)",
                        fontSize: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <span style={{ fontFamily: "monospace", color: "#60a5fa" }}>{ev.type}</span>
                      <span style={{ color: "var(--color-text-tertiary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.data?.adminEmail ? `by ${ev.data.adminEmail}` : ""}
                        {ev.data?.status ? ` · ${ev.data.status}` : ""}
                        {ev.data?.path ? ` · ${ev.data.method || ""} ${ev.data.path}` : ""}
                      </span>
                      <span style={{ color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                        {timeAgo(ev.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handlePromote = async (user: AdminUser, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleDemote = async (user: AdminUser, e: React.MouseEvent) => {
    e.stopPropagation();
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
          Click any account to view balance and activity. Use the buttons to promote or revoke admin access.
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
                  <tr
                    key={u._id}
                    onClick={() => setSelectedId(u._id)}
                    style={{ borderTop: "1px solid var(--color-border)", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
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
                          onClick={(e) => handleDemote(u, e)}
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
                          onClick={(e) => handlePromote(u, e)}
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

      {selectedId && (
        <UserDetailPanel userId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </DashboardLayout>
  );
}
