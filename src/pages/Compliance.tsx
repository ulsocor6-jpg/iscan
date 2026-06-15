import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";
export default function Compliance() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    fetch("/api/v1/kyc/status",{credentials:"include"}).then(r=>r.json()).then(d=>setStatus(d));
  }, []);
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Compliance / KYC</h2>
        <div className="card" style={{maxWidth:500}}>
          <h3>KYC Status</h3>
          {status ? <div className="metric"><span>Status</span><strong style={{color:status?.kycStatus === "verified"?"#22c55e":"#f59e0b"}}>{status?.kycStatus === "verified"?"Verified":"Pending"}</strong></div> : <p style={{color:"#94a3b8"}}>Loading...</p>}
        </div>
      </div>
    </DashboardLayout>
  );
}
