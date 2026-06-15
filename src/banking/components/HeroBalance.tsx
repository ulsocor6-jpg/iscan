import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  data?: {
    totalVolume?: number;
    totalTransactions?: number;
  };
};

export default function HeroBalance({ data }: Props) {
  const navigate = useNavigate();
  const [depositData, setDepositData] = useState<any>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1800); // 30 min
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showDeposit || !depositData) return;
    setTimeLeft(1800);
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowDeposit(false);
          setDepositData(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showDeposit, depositData]);

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");

  async function handleDeposit() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/onramp/deposit-address", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "tron", token: "USDT" })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setDepositData(json.data);
      setShowDeposit(true);
    } catch (err: any) {
      alert("Deposit failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const qrUrl = depositData?.address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${depositData.address}`
    : null;

  return (
    <div className="hero-card">
      <div style={{color:"#94a3b8",fontSize:14}}>ISCAN Operations Dashboard</div>
      <h1 style={{margin:"8px 0"}}>₱{(data?.totalVolume ?? 0).toLocaleString()}</h1>
      <div style={{color:"#94a3b8"}}>{data?.totalTransactions ?? 0} Transactions Processed</div>

      {!showDeposit && (
        <div style={{marginTop:20,display:"flex",gap:10,flexWrap:"wrap"}}>
          <button onClick={handleDeposit} disabled={loading}
            style={{background:"#3b82f6",color:"white",border:"none",padding:"10px 18px",borderRadius:10,cursor:"pointer",fontWeight:600}}>
            {loading ? "Generating..." : "Deposit"}
          </button>
          <button onClick={() => navigate("/transfers")}
            style={{background:"#3b82f6",color:"white",border:"none",padding:"10px 18px",borderRadius:10,cursor:"pointer",fontWeight:600}}>
            Transfer
          </button>
          <button onClick={() => navigate("/swaps")}
            style={{background:"#3b82f6",color:"white",border:"none",padding:"10px 18px",borderRadius:10,cursor:"pointer",fontWeight:600}}>
            Swap
          </button>
          <button onClick={() => navigate("/remittance")}
            style={{background:"#3b82f6",color:"white",border:"none",padding:"10px 18px",borderRadius:10,cursor:"pointer",fontWeight:600}}>
            Remit
          </button>
        </div>
      )}

      {showDeposit && depositData && (
        <div style={{marginTop:20,background:"#0d1526",borderRadius:12,padding:20,display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}>
          <div>
            {qrUrl && <img src={qrUrl} alt="QR Code" style={{borderRadius:8,background:"white",padding:4}}/>}
          </div>
          <div style={{flex:1}}>
            <div style={{color:"#94a3b8",fontSize:12,marginBottom:4}}>USDT-TRC20 Deposit Address</div>
            <div style={{color:"#22c55e",fontSize:13,wordBreak:"break-all",fontFamily:"monospace",background:"#121b2f",padding:8,borderRadius:6,marginBottom:12}}>
              {depositData.address}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{color:"#f59e0b",fontSize:13}}>⏱ Expires in: {mins}:{secs}</span>
              <button onClick={() => navigator.clipboard.writeText(depositData.address)}
                style={{background:"#1d2942",color:"white",border:"none",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>
                Copy
              </button>
            </div>
            <div style={{color:"#94a3b8",fontSize:11}}>Send only USDT (TRC20) to this address. Other assets will be lost.</div>
            <button onClick={() => { setShowDeposit(false); setDepositData(null); }}
              style={{marginTop:12,background:"transparent",color:"#94a3b8",border:"1px solid #1d2942",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:12}}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
