import DashboardLayout from "../banking/components/DashboardLayout";
import HeroBalance from "../banking/components/HeroBalance";
import KPIRow from "../banking/components/KPIRow";
import MarketsPanel from "../banking/components/dashboard/MarketsPanel";
import ActivityFeed from "../banking/components/dashboard/ActivityFeed";
import WalletPortfolio from "../banking/components/dashboard/WalletPortfolio";
import TreasuryHealth from "../banking/components/dashboard/TreasuryHealth";
import ComplianceSnapshot from "../banking/components/dashboard/ComplianceSnapshot";
import { useDashboard } from "../hooks/useDashboard";
import { useAuth } from "../hooks/useAuth";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { dashboard, loading: dashLoading } = useDashboard();

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
        <HeroBalance data={dashboard.hero} />
        <KPIRow data={dashboard.kpi} />
        <div className="dashboard-grid">
          <MarketsPanel />
          <ActivityFeed data={dashboard.activity || []} />
          <WalletPortfolio data={dashboard.portfolio || []} />
          <TreasuryHealth data={dashboard.treasury} />
          <ComplianceSnapshot data={dashboard.compliance} />
        </div>
      </div>
    </DashboardLayout>
  );
}
