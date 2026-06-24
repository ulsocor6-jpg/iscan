import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";
import FlowerTicker from "./dashboard/FlowerTicker";

export default function Header() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

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
        <FlowerTicker />

        <div ref={ref} style={{position:"relative"}}>
          <div
            onClick={() => setOpen(o => !o)}
            style={{display:"flex",alignItems:"center",gap:8,background:"#121b2f",border:"1px solid #1d2942",padding:"8px 14px",borderRadius:12,cursor:"pointer"}}
          >
            <div style={{width:32,height:32,borderRadius:"50%",background:"#3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14}}>
              {user?.firstName?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
              <span style={{fontSize:14,fontWeight:600}}>{user?.firstName ?? "User"}</span>
            </div>
          </div>

          {open && (
            <div style={{position:"absolute", right:0, top:"110%", background:"#121b2f", border:"1px solid #1d2942", borderRadius:12, minWidth:180, zIndex:50, overflow:"hidden"}}>
              <button
                onClick={() => { setOpen(false); navigate("/profile"); }}
                style={{display:"block", width:"100%", textAlign:"left", padding:"10px 14px", background:"none", border:"none", color:"white", cursor:"pointer"}}
              >
                👤 Profile / Accounts
              </button>
              <button
                onClick={handleLogout}
                style={{display:"block", width:"100%", textAlign:"left", padding:"10px 14px", background:"none", border:"none", color:"#ef4444", cursor:"pointer"}}
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
