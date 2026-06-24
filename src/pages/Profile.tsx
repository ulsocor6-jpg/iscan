import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";

const inp = { width:"100%", padding:10, borderRadius:8, border:"1px solid #1d2942", background:"#121b2f", color:"white" };
const PROVIDERS = [
  { value:"bank",  label:"Bank Account" },
  { value:"gcash", label:"GCash" },
  { value:"maya",  label:"Maya" },
];

export default function Profile() {
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({ provider:"bank", bankName:"", accountNumber:"", accountName:"" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/v1/bank/list", { credentials:"include" })
      .then(r => r.json()).then(d => setBanks(d.banks || []));
  }, []);

  async function handleAdd() {
    setLoading(true); setMsg("");
    try {
      const res = await fetch("/api/v1/bank/add", {
        method:"POST", credentials:"include",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setBanks(prev => [...prev, data.bank]);
      setMsg("Account added!");
      setForm({ provider:"bank", bankName:"", accountNumber:"", accountName:"" });
    } catch (err) { setMsg(err.message); }
    finally { setLoading(false); }
  }

  async function handleSetDefault(id) {
    const res = await fetch(`/api/v1/bank/${id}/default`, { method:"POST", credentials:"include" });
    const data = await res.json();
    if (res.ok) {
      setBanks(prev => prev.map(b => ({ ...b, isDefault: b._id === id })));
    }
  }

  async function handleDelete(id) {
    const res = await fetch(`/api/v1/bank/${id}`, { method:"DELETE", credentials:"include" });
    if (res.ok) setBanks(prev => prev.filter(b => b._id !== id));
  }

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Profile — Cash-In / Cash-Out Accounts</h2>

        <div className="card" style={{maxWidth:500, marginBottom:24}}>
          <h3>Add Account</h3>

          <div style={{marginBottom:12}}>
            <label style={{color:"#94a3b8", fontSize:12}}>Provider</label>
            <select style={inp} value={form.provider} onChange={e=>setForm({...form, provider:e.target.value})}>
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {form.provider === "bank" && (
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8", fontSize:12}}>Bank Name</label>
              <input style={inp} value={form.bankName} onChange={e=>setForm({...form, bankName:e.target.value})}/>
            </div>
          )}

          <div style={{marginBottom:12}}>
            <label style={{color:"#94a3b8", fontSize:12}}>
              {form.provider === "bank" ? "Account Number" : "Mobile Number"}
            </label>
            <input style={inp} value={form.accountNumber} onChange={e=>setForm({...form, accountNumber:e.target.value})}/>
          </div>

          <div style={{marginBottom:12}}>
            <label style={{color:"#94a3b8", fontSize:12}}>Account Name</label>
            <input style={inp} value={form.accountName} onChange={e=>setForm({...form, accountName:e.target.value})}/>
          </div>

          <button className="auth-btn" onClick={handleAdd} disabled={loading}>
            {loading ? "Adding..." : "Add Account"}
          </button>
          {msg && <p style={{color:"#22c55e", marginTop:8}}>{msg}</p>}
        </div>

        <div className="card">
          <h3>Linked Accounts</h3>
          {banks.length === 0 && <p style={{color:"#94a3b8"}}>No accounts linked yet.</p>}
          {banks.map((b) => (
            <div key={b._id} className="wallet-row" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div>
                <strong>{PROVIDERS.find(p=>p.value===b.provider)?.label || b.provider}</strong>
                {b.bankName ? ` — ${b.bankName}` : ""}{" "}
                <span style={{color:"#94a3b8"}}>{b.accountNumber}</span>
                {b.isDefault && <span style={{marginLeft:8, color:"#22c55e", fontSize:12}}>DEFAULT</span>}
              </div>
              <div style={{display:"flex", gap:8}}>
                {!b.isDefault && <button onClick={()=>handleSetDefault(b._id)}>Set Default</button>}
                <button onClick={()=>handleDelete(b._id)} style={{color:"#ef4444"}}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
