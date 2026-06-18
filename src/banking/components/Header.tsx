import { useNavigate } from "react-router-dom";
import { logout } from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";
import FlowerTicker from "./dashboard/FlowerTicker";

export default function Header() {
  const navigate = useNavigate();
  const { user } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="header">
      <div className="search">
        <input type="text" placeholder="Search users, wallets, tx hash..." />
      </div>
      <div className="header-actions">
        <button>🔔</button>
        <button>⚙️</button>

        {/* FLOWER live ticker */}
        <FlowerTicker />

        {/* User pill */}
        <div style={{display:"flex",alignItems:"center",gap:8,background:"#121b2f",border:"1px solid #1d2942",padding:"8px 14px",borderRadius:12}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14}}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
            <span style={{fontSize:14,fontWeight:600}}>{user?.firstName ?? "User"}</span>
          </div>
        </div>

        <button onClick={handleLogout} style={{background:"#ef444420",color:"#ef4444",border:"1px solid #ef444440",padding:"8px 14px",borderRadius:12,cursor:"pointer",fontWeight:600}}>
          Logout
        </button>
      </div>
    </header>
  );
}
