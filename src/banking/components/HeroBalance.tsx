import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  data?: {
    totalVolume?: number;
    totalTransactions?: number;
    totalBalancePHP?: number;
    breakdown?: { currency: string; amount: number; php: number }[];
  };
};

const CHAINS = [
  { id: "tron",  token: "USDT",   label: "TRON",  symbol: "USDT-TRC20", color: "#ef4444", icon: "🔴", warning: "Send only USDT (TRC20) to this address. Other assets will be lost." },
  { id: "ronin", token: "FLOWER", label: "Ronin", symbol: "FLOWER",      color: "#2563eb", icon: "🗡️", warning: "Send only FLOWER on Ronin to this address." },
  { id: "base",  token: "FLOWER", label: "Base",  symbol: "FLOWER",        color: "#3b82f6", icon: "🔵", warning: "Send only USDC on Base to this address." },
];

export default function HeroBalance({ data }: Props) {
  const navigate = useNavigate();
  const [step, setStep]             = useState<"idle"|"select"|"qr">("idle");
  const [selectedChain, setSelectedChain] = useState(CHAINS[0]);
  const [depositData, setDepositData]     = useState<any>(null);
  const [timeLeft, setTimeLeft]           = useState(1800);
  const [loading, setLoading]             = useState(false);
  const [copied, setCopied]               = useState(false);

  useEffect(() => {
    if (step !== "qr" || !depositData) return;
    setTimeLeft(1800);
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); setStep("idle"); setDepositData(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step, depositData]);

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/onramp/deposit-address", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: selectedChain.id, token: selectedChain.token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setDepositData(json.data);
      setStep("qr");
    } catch (err: any) {
      alert("Deposit failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(addr: string) {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() { setStep("idle"); setDepositData(null); setCopied(false); }

  const qrUrl = depositData?.address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(depositData.address)}&bgcolor=0d1526&color=ffffff&margin=10`
    : null;

  return (
    <div className="hero-card">
      <div style={{color:"#94a3b8",fontSize:14}}>ISCAN Operations Dashboard</div>
      <h1 style={{margin:"8px 0"}}>₱{(data?.totalBalancePHP ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</h1>
      <div style={{color:"#94a3b8"}}>{data?.totalTransactions ?? 0} Transactions Processed</div>
      {data?.breakdown && data.breakdown.length > 0 && (
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
          {data.breakdown.map(b => (
            <div key={b.currency} style={{background:"#0d1526",borderRadius:8,padding:"6px 12px",fontSize:12,color:"#94a3b8"}}>
              <span style={{color:"white",fontWeight:600}}>{b.amount.toLocaleString(undefined,{maximumFractionDigits:4})}</span> {b.currency}
              {b.currency !== "PHP" && <span style={{color:"#64748b"}}> (₱{b.php.toLocaleString(undefined,{maximumFractionDigits:2})})</span>}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {step === "idle" && (
        <div style={{marginTop:20,display:"flex",gap:10,flexWrap:"wrap"}}>
          <button onClick={() => setStep("select")}
            style={{background:"#3b82f6",color:"white",border:"none",padding:"10px 18px",borderRadius:10,cursor:"pointer",fontWeight:600}}>
            Deposit
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

      {/* Chain selector */}
      {step === "select" && (
        <div style={{marginTop:20,background:"#0d1526",borderRadius:12,padding:20,maxWidth:480}}>
          <div style={{color:"white",fontWeight:600,marginBottom:12}}>Select Deposit Network</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            {CHAINS.map(c => (
              <button key={c.id} onClick={() => setSelectedChain(c)} style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"12px 16px", borderRadius:10, cursor:"pointer",
                border: selectedChain.id === c.id ? `2px solid ${c.color}` : "2px solid #1d2942",
                background: selectedChain.id === c.id ? "#121b2f" : "transparent",
                color:"white", textAlign:"left" as const,
              }}>
                <span style={{fontSize:20}}>{c.icon}</span>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{c.label}</div>
                  <div style={{color:"#94a3b8",fontSize:11}}>{c.symbol}</div>
                </div>
                {selectedChain.id === c.id && (
                  <span style={{marginLeft:"auto",color:c.color,fontSize:16}}>✓</span>
                )}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={handleGenerate} disabled={loading} style={{
              flex:1, background:selectedChain.color, color:"white",
              border:"none", padding:"10px 0", borderRadius:8,
              cursor:"pointer", fontWeight:600,
            }}>
              {loading ? "Generating..." : `Generate ${selectedChain.symbol} Address`}
            </button>
            <button onClick={reset} style={{
              background:"transparent", color:"#94a3b8",
              border:"1px solid #1d2942", padding:"10px 16px",
              borderRadius:8, cursor:"pointer",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* QR display */}
      {step === "qr" && depositData && (
        <div style={{marginTop:20,background:"#0d1526",borderRadius:12,padding:20,display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap",maxWidth:480}}>
          <div>
            {qrUrl && <img src={qrUrl} alt="QR" style={{borderRadius:8,display:"block"}} width={180} height={180}/>}
          </div>
          <div style={{flex:1,minWidth:200}}>
            <div style={{color:"#94a3b8",fontSize:12,marginBottom:4}}>
              {selectedChain.icon} {selectedChain.symbol} Deposit Address
            </div>
            <div style={{
              color:selectedChain.color, fontSize:11, wordBreak:"break-all" as const,
              fontFamily:"monospace", background:"#121b2f",
              padding:8, borderRadius:6, marginBottom:10,
            }}>
              {depositData.address}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{color:"#f59e0b",fontSize:12}}>⏱ {mins}:{secs}</span>
              <button onClick={() => handleCopy(depositData.address)} style={{
                background: copied ? "#22c55e" : "#1d2942",
                color:"white", border:"none", padding:"4px 10px",
                borderRadius:6, cursor:"pointer", fontSize:12,
              }}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div style={{
              background:"#1a1a0a", border:"1px solid #854d0e",
              borderRadius:6, padding:"8px 10px",
              color:"#fbbf24", fontSize:11, marginBottom:10,
            }}>
              ⚠️ {selectedChain.warning}
            </div>
            <button onClick={reset} style={{
              background:"transparent", color:"#94a3b8",
              border:"1px solid #1d2942", padding:"6px 14px",
              borderRadius:8, cursor:"pointer", fontSize:12,
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
