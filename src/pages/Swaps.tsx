import DashboardLayout from "../banking/components/DashboardLayout";
import { useState } from "react";

const inp = {width:"100%",padding:10,borderRadius:8,border:"1px solid #1d2942",background:"#121b2f",color:"white",marginTop:4};

export default function Swaps() {
  const [tab, setTab] = useState("swap");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USDT");
  const [channel, setChannel] = useState("GCASH");
  const [accountNumber, setAccountNumber] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [cashInAmount, setCashInAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSwap() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/swap/php", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:parseFloat(amount),currency})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult({type:"swap", ...data.data});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleCashout() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/payment/cashout", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:parseFloat(amount),channel,accountNumber,receiverName,purpose:"cashout"})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setResult({type:"cashout", ...data});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleCashIn() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/payment/cashin", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:parseFloat(cashInAmount)})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      if (data.checkoutUrl) window.open(data.checkoutUrl, "_blank");
      setResult({type:"cashin", ...data});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const tabStyle = (t) => ({
    padding:"10px 20px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600,
    background: tab===t ? "#3b82f6" : "#1d2942", color:"white", marginRight:8
  });

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Payments</h2>
        <div style={{marginBottom:24}}>
          <button style={tabStyle("swap")} onClick={()=>{setTab("swap");setError("");setResult(null);}}>Crypto → PHP</button>
          <button style={tabStyle("cashout")} onClick={()=>{setTab("cashout");setError("");setResult(null);}}>Cash Out</button>
          <button style={tabStyle("cashin")} onClick={()=>{setTab("cashin");setError("");setResult(null);}}>Cash In</button>
        </div>

        {tab==="swap" && (
          <div className="card" style={{maxWidth:500}}>
            <h3>Swap Crypto to PHP</h3>
            <p style={{color:"#94a3b8",fontSize:13}}>Convert USDT/USDC from your wallet to PHP balance.</p>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Amount</label>
              <input style={inp} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{color:"#94a3b8",fontSize:12}}>From Currency</label>
              <select style={inp} value={currency} onChange={e=>setCurrency(e.target.value)}>
                <option>USDT</option><option>USDC</option>
              </select>
            </div>
            <button className="auth-btn" onClick={handleSwap} disabled={loading}>{loading?"Swapping...":"Swap to PHP"}</button>
            {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
            {result?.type==="swap" && (
              <div style={{marginTop:16,padding:12,background:"#0d1526",borderRadius:8}}>
                <p style={{color:"#22c55e",margin:0}}>✓ Swap successful!</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>Rate: {result.rate} PHP per {currency}</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:0}}>PHP credited: ₱{result.phpAmount?.toLocaleString()}</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:0}}>Ref: {result.referenceId}</p>
              </div>
            )}
          </div>
        )}

        {tab==="cashout" && (
          <div className="card" style={{maxWidth:500}}>
            <h3>Cash Out to GCash / Maya / Bank</h3>
            <p style={{color:"#94a3b8",fontSize:13}}>Send your PHP balance to a local account. Fee: 1.5%</p>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Amount (PHP)</label>
              <input style={inp} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Channel</label>
              <select style={inp} value={channel} onChange={e=>setChannel(e.target.value)}>
                <option>GCASH</option><option>MAYA</option><option>BDO</option><option>BPI</option><option>UNIONBANK</option>
              </select>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Account Number / Mobile</label>
              <input style={inp} placeholder="09XXXXXXXXX or account number" value={accountNumber} onChange={e=>setAccountNumber(e.target.value)}/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Receiver Name</label>
              <input style={inp} placeholder="Full name" value={receiverName} onChange={e=>setReceiverName(e.target.value)}/>
            </div>
            {amount && <p style={{color:"#94a3b8",fontSize:12,marginBottom:12}}>Fee: ₱{(parseFloat(amount||0)*0.015).toFixed(2)} · Total deducted: ₱{(parseFloat(amount||0)*1.015).toFixed(2)}</p>}
            <button className="auth-btn" onClick={handleCashout} disabled={loading}>{loading?"Processing...":"Cash Out"}</button>
            {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
            {result?.type==="cashout" && (
              <div style={{marginTop:16,padding:12,background:"#0d1526",borderRadius:8}}>
                <p style={{color:"#22c55e",margin:0}}>✓ Cashout submitted!</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>Ref: {result.referenceId}</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:0}}>Amount: ₱{result.amount} · Fee: ₱{result.fee}</p>
              </div>
            )}
          </div>
        )}

        {tab==="cashin" && (
          <div className="card" style={{maxWidth:500}}>
            <h3>Cash In via PayMongo</h3>
            <p style={{color:"#94a3b8",fontSize:13}}>Add PHP to your wallet using GCash, Maya, credit/debit card.</p>
            <div style={{marginBottom:16}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Amount (PHP)</label>
              <input style={inp} type="number" placeholder="Min ₱20" value={cashInAmount} onChange={e=>setCashInAmount(e.target.value)}/>
            </div>
            <button className="auth-btn" onClick={handleCashIn} disabled={loading}>{loading?"Creating link...":"Generate Payment Link"}</button>
            {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
            {result?.type==="cashin" && (
              <div style={{marginTop:16,padding:12,background:"#0d1526",borderRadius:8}}>
                <p style={{color:"#22c55e",margin:0}}>✓ Payment link created!</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>A checkout tab has been opened.</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:0}}>Ref: {result.referenceId}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
