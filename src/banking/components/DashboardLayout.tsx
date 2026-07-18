import Sidebar from "./Sidebar";
import Header from "./Header";
import ImpersonationBanner from "./ImpersonationBanner";
import UserTools from "./UserTools";
import { BackgroundProvider, useBackground } from "../../hooks/useBackground";

type Props = {
  children: React.ReactNode;
};

function BackgroundLayer() {
  const { background } = useBackground();
  if (background.type === "none" || !background.value) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        backgroundImage: `url(${background.value})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(5,9,18,0.82)" }} />
    </div>
  );
}

export default function DashboardLayout({
  children
}: Props) {
  return (
    <BackgroundProvider>
      <div className="layout" style={{ position: "relative", zIndex: 0 }}>
        <BackgroundLayer />
        <Sidebar />
        <main className="main-content">
          <ImpersonationBanner />
          <Header />
          {children}
        </main>
        <UserTools />
      </div>
    </BackgroundProvider>
  );
}
