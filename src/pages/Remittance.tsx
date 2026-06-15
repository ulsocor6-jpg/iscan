import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";
const inp = {width:"100%",padding:10,borderRadius:8,border:"1px solid #1d2942",background:"#121b2f",color:"white"};
export default function Remittance() {
  const [rates, setRates] = useState(null);
  const [form, setForm] = useState({senderAddress:"",receiverAddress:"",amount:"",currency:"USDC",notes:""});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/v1/remittance/rates").then(r=>r.json()).then(d=>setRates(d.rates)); }, []);
  async function handleSend() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/remittance/send", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,amount:parseFloat(form.amount)})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Remittance</h2>
        {rates && <div className="card" style={{marginBottom:16}}><h3>Live Rates</h3>{Object.entries(rates).map(([k,v])=><div key={k} className="metric"><span>{k}</span><strong>₱{v}</strong></div>)}</div>}
        <div className="card" style={{maxWidth:500}}>
          <h3>Send Remittance</h3>
          {["senderAddress","receiverAddress","amount","notes"].map(f=><div key={f} style={{marginBottom:12}}><label style={{color:"#94a3b8",fontSize:12}}>{f}</label><input style={inp} value={form[f]} onChange={e=>setForm({...form,[f]:e.target.value})}/></div>)}
          <div style={{marginBottom:16}}><label style={{color:"#94a3b8",fontSize:12}}>Currency</label><select style={inp} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option>USDC</option><option>USDT</option><option>ETH</option><option>RON</option></select></div>
          <button className="auth-btn" onClick={handleSend} disabled={loading}>{loading?"Sending...":"Send Remittance"}</button>
          {error && <p style={{color:"red",marginTop:8}}>{error}</p>}
          {result && <p style={{color:"#22c55e",marginTop:8}}>Sent! Ref: {result.transaction?.referenceId}</p>}
        </div>
      </div>
    </DashboardLayout>
  );
}
