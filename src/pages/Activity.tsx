import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";
export default function Activity() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/v1/transactions",{credentials:"include"}).then(r=>r.json()).then(d=>{setTxs(d.transactions||[]);setLoading(false);});
  }, []);
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Activity</h2>
        <div className="card">
          {loading && <p>Loading...</p>}
          {!loading && txs.length===0 && <p style={{color:"#94a3b8"}}>No transactions yet.</p>}
          {txs.map((tx,i)=>(
            <div key={i} className="activity-item">
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <strong>{(tx.type||"UNKNOWN").toUpperCase()}</strong>
                <span style={{color:tx.direction==="in"?"#22c55e":"#ef4444"}}>{tx.direction==="in"?"+":"-"}{tx.amount} {tx.currency}</span>
              </div>
              <div style={{color:"#94a3b8",fontSize:12,marginTop:4}}>{tx.referenceNumber} · {tx.status} · {new Date(tx.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
