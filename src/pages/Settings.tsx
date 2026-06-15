import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";
const inp = {width:"100%",padding:10,borderRadius:8,border:"1px solid #1d2942",background:"#121b2f",color:"white"};
export default function Settings() {
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({bankName:"",accountNumber:"",accountName:""});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/v1/bank/list",{credentials:"include"}).then(r=>r.json()).then(d=>setBanks(d.banks||[])); }, []);
  async function handleAdd() {
    setLoading(true); setMsg("");
    try {
      const res = await fetch("/api/v1/bank/add",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setBanks(prev=>[...prev,data.bank]);
      setMsg("Bank account added!");
      setForm({bankName:"",accountNumber:"",accountName:""});
    } catch (err) { setMsg(err.message); }
    finally { setLoading(false); }
  }
  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Settings</h2>
        <div className="card" style={{maxWidth:500,marginBottom:24}}>
          <h3>Add Bank Account</h3>
          {["bankName","accountNumber","accountName"].map(f=><div key={f} style={{marginBottom:12}}><label style={{color:"#94a3b8",fontSize:12}}>{f}</label><input style={inp} value={form[f]} onChange={e=>setForm({...form,[f]:e.target.value})}/></div>)}
          <button className="auth-btn" onClick={handleAdd} disabled={loading}>{loading?"Adding...":"Add Bank"}</button>
          {msg && <p style={{color:"#22c55e",marginTop:8}}>{msg}</p>}
        </div>
        <div className="card"><h3>Linked Banks</h3>
          {banks.length===0 && <p style={{color:"#94a3b8"}}>No banks linked yet.</p>}
          {banks.map((b,i)=><div key={i} className="wallet-row"><strong>{b.bankName}</strong><span style={{color:"#94a3b8"}}>{b.accountNumber}</span></div>)}
        </div>
      </div>
    </DashboardLayout>
  );
}
