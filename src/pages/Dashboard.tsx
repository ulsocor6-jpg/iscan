import DashboardLayout from "../banking/components/DashboardLayout";
import HeroBalance from "../banking/components/HeroBalance";
import KPIRow from "../banking/components/KPIRow";
import MarketsPanel from "../banking/components/dashboard/MarketsPanel";
import ActivityFeed from "../banking/components/dashboard/ActivityFeed";
import WalletPortfolio from "../banking/components/dashboard/WalletPortfolio";
import TreasuryHealth from "../banking/components/dashboard/TreasuryHealth";
import ComplianceSnapshot from "../banking/components/dashboard/ComplianceSnapshot";
import PendingWithdrawals from "../banking/components/PendingWithdrawals";
import { useDashboard } from "../hooks/useDashboard";
import { useAuth } from "../hooks/useAuth";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const {
    dashboard,
    loading: dashLoading,
    refreshChainBalances,
    refreshingChain,
    refreshError,
  } = useDashboard();

  if (authLoading || dashLoading) {
    return (
      <DashboardLayout>
        <div style={{ padding: 40 }}>Loading...</div>
      </DashboardLayout>
    );
  }
  if (!user) {
    return (
      <DashboardLayout>
        <div style={{ padding: 40 }}>Not logged in.</div>
      </DashboardLayout>
    );
  }
  if (!dashboard) {
    return (
      <DashboardLayout>
        <div style={{ padding: 40 }}>Dashboard unavailable.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dashboard">
        <PendingWithdrawals />
        <HeroBalance data={dashboard.hero} />
        <KPIRow data={dashboard.kpi} />
        <div className="dashboard-grid">
          <MarketsPanel />
          <ActivityFeed data={dashboard.activity || []} />

          <div className="portfolio-panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {dashboard.chainBalancesLoaded
                  ? `Chain balances as of ${new Date(dashboard.lastRefreshedAt).toLocaleTimeString()}`
                  : "Chain balances not yet loaded"}
              </span>
              <button
                onClick={refreshChainBalances}
                disabled={refreshingChain}
                style={{
                  background: refreshingChain ? "#1f2937" : "#2563eb",
                  border: "none",
                  color: "white",
                  fontSize: 12,
                  padding: "6px 12px",
                  borderRadius: 8,
                  cursor: refreshingChain ? "default" : "pointer",
                }}
              >
                {refreshingChain ? "Refreshing…" : "↻ Refresh balances"}
              </button>
            </div>
            {refreshError && (
              <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>
                {refreshError}
              </div>
            )}
            <WalletPortfolio data={dashboard.portfolio || []} />
          </div>

          <TreasuryHealth data={dashboard.treasury} />
          <ComplianceSnapshot data={dashboard.compliance} />
        </div>
      </div>
    </DashboardLayout>
  );
}
