import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login          from "./pages/Login";
import Register       from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Deposits     from "./pages/Deposits";
import Withdrawals  from "./pages/Withdrawals";
import Transfers    from "./pages/Transfers";
import Swaps        from "./pages/Swaps";
import Remittance   from "./pages/Remittance";
import Activity     from "./pages/Activity";
import Compliance   from "./pages/Compliance";
import AdminReconciliation from "./pages/AdminReconciliation";
import AdminCashouts from './pages/AdminCashouts';
import AdminDeposits from './pages/AdminDeposits';
import AdminUsers from './pages/AdminUsers';
import SystemInspector from './pages/SystemInspector';
import BlockchainInspector from './pages/BlockchainInspector';
import SwapInspector from './pages/SwapInspector';
import Treasury     from "./pages/Treasury";
import Profile        from "./pages/Profile";
import WalletManager from "./pages/WalletManager";
import Dashboard      from "./pages/Dashboard";
import MissionControl from "./pages/MissionControl";
import InternalInspector from "./pages/technical/InternalInspector";
import Operator from "./pages/Operator";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { loading, authenticated } = useAuth();
  if (loading) return null;
  return authenticated ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { loading, authenticated, user } = useAuth();
  if (loading) return null;
  if (!authenticated) return <Navigate to="/login" replace />;
  return user?.role === "admin" ? children : <Navigate to="/dashboard" replace />;
}

function GuestOnly({ children }: { children: JSX.Element }) {
  const { loading, authenticated } = useAuth();
  if (loading) return null;
  return authenticated ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ForgotPassword resetMode />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/deposits"   element={<RequireAuth><Deposits /></RequireAuth>} />
        <Route path="/withdrawals" element={<RequireAuth><Withdrawals /></RequireAuth>} />
        <Route path="/transfers"  element={<RequireAuth><Transfers /></RequireAuth>} />
        <Route path="/swaps"      element={<RequireAuth><Swaps /></RequireAuth>} />
        <Route path="/remittance" element={<RequireAuth><Remittance /></RequireAuth>} />
        <Route path="/activity"   element={<RequireAuth><Activity /></RequireAuth>} />
        <Route path="/compliance" element={<RequireAuth><Compliance /></RequireAuth>} />
        <Route path="/admin/cashouts" element={<RequireAdmin><AdminCashouts /></RequireAdmin>} />
        <Route path="/admin/deposits" element={<RequireAdmin><AdminDeposits /></RequireAdmin>} />
        <Route path="/admin/reconciliation" element={<RequireAdmin><AdminReconciliation /></RequireAdmin>} />
        <Route path="/admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
        <Route path="/admin/operator" element={<RequireAdmin><Operator /></RequireAdmin>} />
        <Route path="/admin/system-inspector" element={<RequireAdmin><SystemInspector /></RequireAdmin>} />
        <Route path="/admin/blockchain-inspector" element={<RequireAdmin><BlockchainInspector /></RequireAdmin>} />
        <Route path="/admin/mission-control" element={<RequireAdmin><MissionControl /></RequireAdmin>} />
        <Route path="/admin/swap-inspector" element={<RequireAdmin><SwapInspector /></RequireAdmin>} />
        <Route path="/admin/inspector" element={<RequireAdmin><InternalInspector /></RequireAdmin>} />
        <Route path="/treasury"      element={<RequireAdmin><Treasury /></RequireAdmin>} />
        <Route path="/wallets"       element={<RequireAuth><WalletManager /></RequireAuth>} />
        <Route path="/inspector"     element={<RequireAdmin><InternalInspector /></RequireAdmin>} />
        <Route path="/profile"    element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
