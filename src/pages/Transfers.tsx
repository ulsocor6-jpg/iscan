import DashboardLayout from "../banking/components/DashboardLayout";
import { useState } from "react";
const inp = {width:"100%",padding:10,borderRadius:8,border:"1px solid #1d2942",background:"#121b2f",color:"white"};
export default function Transfers() {
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState("PHP");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  async function handleSend() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/transfer/send", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({receiverEmail:receiver,amount:parseFloat(amount),asset})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Transfers</h2>
        <div className="card" style={{maxWidth:500}}>
          <h3>Send Funds</h3>
          <div style={{marginBottom:12}}><label style={{color:"#94a3b8",fontSize:12}}>Receiver Email</label><input style={inp} placeholder="receiver@email.com" value={receiver} onChange={e=>setReceiver(e.target.value)}/></div>
          <div style={{marginBottom:12}}><label style={{color:"#94a3b8",fontSize:12}}>Amount</label><input style={inp} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
          <div style={{marginBottom:16}}><label style={{color:"#94a3b8",fontSize:12}}>Asset</label><select style={inp} value={asset} onChange={e=>setAsset(e.target.value)}><option>PHP</option><option>USDT</option><option>USDC</option></select></div>
          <button className="auth-btn" onClick={handleSend} disabled={loading}>{loading?"Sending...":"Send"}</button>
          {error && <p style={{color:"red",marginTop:8}}>{error}</p>}
          {result && <p style={{color:"#22c55e",marginTop:8}}>Transfer successful! Ref: {result.data?.referenceId}</p>}
        </div>
      </div>
    </DashboardLayout>
  );
}
