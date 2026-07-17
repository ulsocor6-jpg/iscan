import { useEffect, useState, useCallback } from "react";

const API = "/api/v1/dashboard";
const REFRESH_API = "/api/v1/dashboard/refresh-balances";

export function useDashboard() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Separate from `loading` (initial page load) — this only reflects the
  // on-demand chain-balance refresh, so a button can show its own spinner
  // without re-triggering the full-page "Loading..." state.
  const [refreshingChain, setRefreshingChain] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(API, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.success) {
        setDashboard(json);  // your API returns json directly, not json.data
      } else {
        setError(json.message || "Failed to load dashboard");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // On-demand only — call this from a button's onClick. Never called on
  // an interval. Hits GET /dashboard/refresh-balances, which is the one
  // endpoint that actually queries Base/Ronin RPC (backend also enforces
  // an 8s per-user cooldown, so rapid re-clicks come back `throttled`
  // instead of re-hitting RPC).
  const refreshChainBalances = useCallback(async () => {
    setRefreshingChain(true);
    setRefreshError(null);
    try {
      const res = await fetch(REFRESH_API, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setRefreshError(json.message || "Failed to refresh chain balances");
        return;
      }
      // Merge onto existing dashboard state rather than replacing it —
      // refresh-balances doesn't return recentTransactions/kpi/etc.
      setDashboard((prev: any) => ({
        ...prev,
        balances: json.balances,
        onchainBalances: json.onchainBalances,
        chainBalancesLoaded: json.chainBalancesLoaded,
        lastRefreshedAt: json.lastRefreshedAt,
        portfolio: json.portfolio,
        hero: json.hero,
      }));
      if (json.throttled) {
        setRefreshError(`Refreshed recently — try again in ${Math.ceil(json.retryAfterMs / 1000)}s`);
      }
    } catch (err) {
      setRefreshError("Network error");
    } finally {
      setRefreshingChain(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Ledger-only endpoint now (no RPC calls) — safe to poll on an
    // interval. Chain balances themselves are never auto-refreshed;
    // that's exclusively refreshChainBalances(), called by the user.
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  return {
    dashboard,
    loading,
    error,
    reload: load,
    refreshChainBalances,
    refreshingChain,
    refreshError,
  };
}
