import DashboardLayout from "../banking/components/DashboardLayout";
import { useState } from "react";
import { createDepositAddress } from "../services/api";
export default function Deposits() {
  const [address, setAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function handleCreate() {
    setLoading(true); setError("");
    try { const data = await createDepositAddress(); setAddress(data.address); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Deposits</h2>
        <div className="card" style={{maxWidth:500}}>
          <h3>Create Deposit Address</h3>
          <button className="auth-btn" onClick={handleCreate} disabled={loading}>
            {loading ? "Generating..." : "Generate Deposit Address"}
          </button>
          {error && <p style={{color:"red"}}>{error}</p>}
          {address && <div style={{marginTop:16}}>
            <p style={{color:"#94a3b8"}}>Your deposit address:</p>
            <code style={{color:"#22c55e",wordBreak:"break-all"}}>{address}</code>
          </div>}
        </div>
      </div>
    </DashboardLayout>
  );
}
