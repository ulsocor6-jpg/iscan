import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";
export default function Treasury() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/v1/wallet/list",{credentials:"include"}).then(r=>r.json()).then(d=>{setWallets(d.wallets||[]);setLoading(false);});
  }, []);
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Treasury</h2>
        <div className="card">
          {loading && <p>Loading...</p>}
          {!loading && wallets.length===0 && <p style={{color:"#94a3b8"}}>No wallets found.</p>}
          {wallets.map((w,i)=><div key={i} className="wallet-row"><strong>{w.iscanAddress}</strong><span style={{color:w.status==="active"?"#22c55e":"#94a3b8"}}>{w.status}</span></div>)}
        </div>
      </div>
    </DashboardLayout>
  );
}
