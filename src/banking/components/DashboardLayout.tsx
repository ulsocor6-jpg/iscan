import Sidebar from "./Sidebar";
import Header from "./Header";

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

        <Header />

        {children}

      </main>

    </div>
  );
}
