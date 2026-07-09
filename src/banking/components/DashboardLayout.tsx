import Sidebar from "./Sidebar";
import Header from "./Header";
import ImpersonationBanner from "./ImpersonationBanner";

type Props = {
  children: React.ReactNode;
};

export default function DashboardLayout({
  children
}: Props) {
  return (
    <div className="layout">

      <Sidebar />

      <main className="main-content">

        <ImpersonationBanner />

        <Header />

        {children}

      </main>

    </div>
  );
}
