import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";

const inp = {width:"100%",padding:10,borderRadius:8,border:"1px solid #1d2942",background:"#121b2f",color:"white",marginTop:4,boxSizing:"border-box" as const};
const card = {background:"#0d1526",borderRadius:12,padding:20,maxWidth:500,marginBottom:16};

const WALLETS = [
  { id:"metamask", name:"MetaMask", icon:"🦊" },
  { id:"ronin",    name:"Ronin",    icon:"🗡️" },
];

export default function Swaps() {
  const [tab, setTab]                     = useState("crypto-php");
  const [amount, setAmount]               = useState("");
  const [currency, setCurrency]           = useState("USDT");
  const [toCurrency, setToCurrency]       = useState("USDT");
  const [channel, setChannel]             = useState("GCASH");
  const [accountNumber, setAccountNumber] = useState("");
  const [receiverName, setReceiverName]   = useState("");
  const [cashInAmount, setCashInAmount]   = useState("");
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState<any>(null);
  const [error, setError]                 = useState("");
  const [quote, setQuote]                 = useState<any>(null);
  const [quoting, setQuoting]             = useState(false);
  const [balances, setBalances]           = useState<any>({});
  const [connectedWallet, setConnectedWallet] = useState<string|null>(null);
  const [walletAddress, setWalletAddress]     = useState<string|null>(null);

  // FLOWER ↔ USDT swap state
  const [fuDirection, setFuDirection] = useState<"flower-to-usdt"|"usdt-to-flower">("flower-to-usdt");
  const [fuAmount, setFuAmount]       = useState("");
  const [fuQuote, setFuQuote]         = useState<any>(null);
  const [fuQuoting, setFuQuoting]     = useState(false);
  const [fuLoading, setFuLoading]     = useState(false);
  const [flowerChain, setFlowerChain] = useState("RONIN");
  const [fuResult, setFuResult]       = useState<any>(null);
  const [fuError, setFuError]         = useState("");

  const phpBal    = balances?.PHP    || balances?.php    || 0;
  const usdtBal   = balances?.USDT   || balances?.usdt   || 0;
  const usdcBal   = balances?.USDC   || balances?.usdc   || 0;
  const flowerBal = balances?.FLOWER || balances?.flower || 0;

  // Fetch balances
  useEffect(() => {
    fetch("/api/v1/wallet/balances", { credentials:"include" })
      .then(r => r.json()).then(d => setBalances(d.balances || d || {}))
      .catch(() => {});
  }, [result, fuResult]);

  // Live quote — PHP swaps
  useEffect(() => {
    if (!amount || isNaN(parseFloat(amount))) { setQuote(null); return; }
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const from = tab === "php-usdt" ? "PHP" : currency;
        const to   = tab === "php-usdt" ? toCurrency : "PHP";
        const res  = await fetch(
          `/api/v1/php-swap/quote?fromCurrency=${from}&toCurrency=${to}&amount=${amount}`,
          { credentials:"include" }
        );
        const data = await res.json();
        setQuote(data);
      } catch { setQuote(null); }
      finally { setQuoting(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [amount, currency, toCurrency, tab]);

  // Live quote — FLOWER ↔ USDT
  useEffect(() => {
    if (!fuAmount || isNaN(parseFloat(fuAmount))) { setFuQuote(null); return; }
    const from = fuDirection === "flower-to-usdt" ? "FLOWER" : "USDT";
    const to   = fuDirection === "flower-to-usdt" ? "USDT"   : "FLOWER";
    const timer = setTimeout(async () => {
      setFuQuoting(true);
      try {
        const res  = await fetch(
          `/api/v1/flower/usdt/quote?fromCurrency=${from}&toCurrency=${to}&amount=${fuAmount}`,
          { credentials:"include" }
        );
        const data = await res.json();
        setFuQuote(data);
      } catch { setFuQuote(null); }
      finally { setFuQuoting(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [fuAmount, fuDirection]);

  async function handleFlowerUsdtSwap() {
    setFuLoading(true); setFuError(""); setFuResult(null);
    try {
      const from = fuDirection === "flower-to-usdt" ? "FLOWER" : "USDT";
      const to   = fuDirection === "flower-to-usdt" ? "USDT"   : "FLOWER";
      const res  = await fetch("/api/v1/flower/usdt/swap", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ fromCurrency:from, toCurrency:to, amount:parseFloat(fuAmount) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setFuResult(data);
      setFuAmount("");
      setFuQuote(null);
    } catch(err:any) { setFuError(err.message); }
    finally { setFuLoading(false); }
  }

  function flipFu() {
    setFuDirection(d => d === "flower-to-usdt" ? "usdt-to-flower" : "flower-to-usdt");
    setFuAmount(""); setFuQuote(null); setFuError(""); setFuResult(null);
  }

  async function handleSwap() {
    setLoading(true); setError(""); setResult(null);
    try {
      const from = tab === "php-usdt" ? "PHP" : currency;
      const to   = tab === "php-usdt" ? toCurrency : "PHP";
      const res  = await fetch("/api/v1/php-swap/execute", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ fromCurrency:from, toCurrency:to, amount:parseFloat(amount) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setResult({ type:"swap", ...data });
      setAmount("");
    } catch(err:any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleCashout() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/payment/cashout", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ amount:parseFloat(amount), channel, accountNumber, receiverName, purpose:"cashout" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setResult({ type:"cashout", ...data });
    } catch(err:any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleCashIn() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/payment/cashin", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ amount:parseFloat(cashInAmount) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      if (data.checkoutUrl) window.open(data.checkoutUrl, "_blank");
      setResult({ type:"cashin", ...data });
    } catch(err:any) { setError(err.message); }
    finally { setLoading(false); }
  }

  function detectInjectedProviders(): Promise<any[]> {
    return new Promise((resolve) => {
      const found: any[] = [];
      const handler = (event: any) => { found.push(event.detail); };
      window.addEventListener("eip6963:announceProvider", handler as any);
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      setTimeout(() => {
        window.removeEventListener("eip6963:announceProvider", handler as any);
        resolve(found);
      }, 250);
    });
  }

  async function getMetaMaskProvider(): Promise<any> {
    const announced = await detectInjectedProviders();
    const mm = announced.find((p: any) => p.info?.rdns === "io.metamask");
    if (mm) return mm.provider;
    const eth = (window as any).ethereum;
    if (eth?.providers?.length) {
      return eth.providers.find((p: any) => p.isMetaMask) || null;
    }
    return eth?.isMetaMask ? eth : null;
  }

  async function connectWallet(id: string) {
    try {
      let address = "";
      if (id === "metamask") {
        const provider = await getMetaMaskProvider();
        if (!provider) { alert("MetaMask not found. If you have multiple wallet extensions, make sure MetaMask is enabled."); return; }
        const accounts = await provider.request({ method:"eth_requestAccounts" });
        address = accounts[0];
      } else if (id === "ronin") {
        if (!(window as any).ronin) { alert("Ronin wallet not installed"); return; }
        const accounts = await (window as any).ronin.provider.request({ method:"eth_requestAccounts" });
        address = accounts[0];
      }
      setConnectedWallet(id);
      setWalletAddress(address);
    } catch(err:any) { setError(err.message); }
  }

  const tabStyle = (t: string) => ({
    padding:"10px 20px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600,
    background: tab===t ? "#3b82f6" : "#1d2942", color:"white", marginRight:8, marginBottom:8
  });

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Payments</h2>

        {/* Balance Bar */}
        <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap" as const}}>
          {[
            ["PHP",    "₱",  phpBal],
            ["USDT",   "$",  usdtBal],
            ["USDC",   "$",  usdcBal],
            ["FLOWER", "🌸", flowerBal],
          ].map(([cur,sym,bal])=>(
            <div key={cur as string} style={{background:"#0d1526",borderRadius:10,padding:"12px 20px",minWidth:140}}>
              <div style={{color:"#94a3b8",fontSize:11,marginBottom:2}}>{cur as string} Balance</div>
              <div style={{color:"white",fontSize:20,fontWeight:700}}>
                {sym as string}{(+bal).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
              </div>
            </div>
          ))}
        </div>

        {/* Wallet Connect */}
        <div style={{...card,marginBottom:24}}>
          <div style={{color:"#94a3b8",fontSize:12,marginBottom:10}}>Connect Wallet</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap" as const}}>
            {WALLETS.map(w => (
              <button key={w.id} onClick={() => connectWallet(w.id)} style={{
                padding:"8px 16px", borderRadius:8, border:"1px solid #1d2942",
                background: connectedWallet===w.id ? "#1a3a1a" : "#121b2f",
                color: connectedWallet===w.id ? "#22c55e" : "white",
                cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", gap:6
              }}>
                {w.icon} {w.name}{connectedWallet===w.id && " ✓"}
              </button>
            ))}
          </div>
          {walletAddress && (
            <div style={{marginTop:10,color:"#94a3b8",fontSize:11}}>
              Connected: <span style={{color:"#22c55e",fontFamily:"monospace"}}>
                {walletAddress.slice(0,8)}...{walletAddress.slice(-6)}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{marginBottom:24}}>
          <button style={tabStyle("crypto-php")} onClick={()=>{setTab("crypto-php");setError("");setResult(null);setQuote(null);}}>
            Crypto → PHP
          </button>
          <button style={tabStyle("php-usdt")} onClick={()=>{setTab("php-usdt");setError("");setResult(null);setQuote(null);}}>
            PHP → USDT/USDC
          </button>
          <button style={tabStyle("cashout")} onClick={()=>{setTab("cashout");setError("");setResult(null);}}>
            Cash Out
          </button>
          <button style={tabStyle("cashin")} onClick={()=>{setTab("cashin");setError("");setResult(null);}}>
            Cash In
          </button>
          {/* FLOWER ↔ USDT tab */}
          <button
            style={{
              ...tabStyle("flower-usdt"),
              background: tab==="flower-usdt"
                ? "linear-gradient(135deg,#9333ea,#f59e0b)"
                : "#1d2942"
            }}
            onClick={()=>{setTab("flower-usdt");setFuError("");setFuResult(null);}}
          >
            🌸 FLOWER ↔ USDT
          </button>
        </div>

        {/* ── Crypto → PHP ──────────────────────────────────────────────── */}
        {tab==="crypto-php" && (
          <div style={card}>
            <h3 style={{margin:"0 0 4px"}}>Swap Crypto → PHP</h3>
            <p style={{color:"#94a3b8",fontSize:13,marginTop:0}}>Convert USDT/USDC to PHP balance.</p>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>From Currency</label>
              <select style={inp} value={currency} onChange={e=>setCurrency(e.target.value)}>
                <option>USDT</option><option>USDC</option>
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Amount</label>
              <input style={inp} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
            {quoting && <p style={{color:"#94a3b8",fontSize:12}}>Getting rate...</p>}
            {quote && !quoting && (
              <div style={{background:"#121b2f",borderRadius:8,padding:12,marginBottom:16}}>
                <div style={{color:"white",fontSize:16,fontWeight:600,marginBottom:4}}>{quote.display}</div>
                <div style={{color:"#22c55e",fontSize:20,fontWeight:700}}>You get {quote.youGetLabel}</div>
                <div style={{color:"#94a3b8",fontSize:12,marginTop:4}}>Slippage {quote.slippageLabel}</div>
              </div>
            )}
            <button className="auth-btn" onClick={handleSwap} disabled={loading||!amount}>
              {loading ? "Swapping..." : "Swap to PHP"}
            </button>
            {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
            {result?.type==="swap" && (
              <div style={{marginTop:12,padding:12,background:"#0a1f0a",borderRadius:8}}>
                <p style={{color:"#22c55e",margin:0}}>✓ Swap successful!</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>Ref: {result.txRef}</p>
              </div>
            )}
          </div>
        )}

        {/* ── PHP → USDT/USDC ───────────────────────────────────────────── */}
        {tab==="php-usdt" && (
          <div style={card}>
            <h3 style={{margin:"0 0 4px"}}>Swap PHP → Crypto</h3>
            <p style={{color:"#94a3b8",fontSize:13,marginTop:0}}>Convert PHP balance to USDT or USDC.</p>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>To Currency</label>
              <select style={inp} value={toCurrency} onChange={e=>setToCurrency(e.target.value)}>
                <option>USDT</option><option>USDC</option>
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Amount (PHP)</label>
              <input style={inp} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
            {quoting && <p style={{color:"#94a3b8",fontSize:12}}>Getting rate...</p>}
            {quote && !quoting && (
              <div style={{background:"#121b2f",borderRadius:8,padding:12,marginBottom:16}}>
                <div style={{color:"white",fontSize:16,fontWeight:600,marginBottom:4}}>{quote.display}</div>
                <div style={{color:"#22c55e",fontSize:20,fontWeight:700}}>You get {quote.youGetLabel}</div>
                <div style={{color:"#94a3b8",fontSize:12,marginTop:4}}>Slippage {quote.slippageLabel}</div>
              </div>
            )}
            <button className="auth-btn" onClick={handleSwap} disabled={loading||!amount}>
              {loading ? "Swapping..." : `Swap to ${toCurrency}`}
            </button>
            {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
            {result?.type==="swap" && (
              <div style={{marginTop:12,padding:12,background:"#0a1f0a",borderRadius:8}}>
                <p style={{color:"#22c55e",margin:0}}>✓ Swap successful!</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>Ref: {result.txRef}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Cash Out ──────────────────────────────────────────────────── */}
        {tab==="cashout" && (
          <div style={card}>
            <h3 style={{margin:"0 0 4px"}}>Cash Out</h3>
            <p style={{color:"#94a3b8",fontSize:13,marginTop:0}}>Send PHP to GCash, Maya, or Bank. Fee: 1.5%</p>
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
              <input style={inp} placeholder="09XXXXXXXXX" value={accountNumber} onChange={e=>setAccountNumber(e.target.value)}/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Receiver Name</label>
              <input style={inp} placeholder="Full name" value={receiverName} onChange={e=>setReceiverName(e.target.value)}/>
            </div>
            {amount && (
              <div style={{background:"#121b2f",borderRadius:8,padding:12,marginBottom:16}}>
                <div style={{color:"#94a3b8",fontSize:12}}>Fee: ₱{(parseFloat(amount||"0")*0.015).toFixed(2)}</div>
                <div style={{color:"white",fontSize:16,fontWeight:600}}>Total deducted: ₱{(parseFloat(amount||"0")*1.015).toFixed(2)}</div>
              </div>
            )}
            <button className="auth-btn" onClick={handleCashout} disabled={loading}>
              {loading ? "Processing..." : "Cash Out"}
            </button>
            {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
            {result?.type==="cashout" && (
              <div style={{marginTop:12,padding:12,background:"#0a1f0a",borderRadius:8}}>
                <p style={{color:"#22c55e",margin:0}}>✓ Cashout submitted!</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>Ref: {result.referenceId}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Cash In ───────────────────────────────────────────────────── */}
        {tab==="cashin" && (
          <div style={card}>
            <h3 style={{margin:"0 0 4px"}}>Cash In</h3>
            <p style={{color:"#94a3b8",fontSize:13,marginTop:0}}>Add PHP via GCash, Maya, or card.</p>
            <div style={{marginBottom:16}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Amount (PHP)</label>
              <input style={inp} type="number" placeholder="Min ₱20" value={cashInAmount} onChange={e=>setCashInAmount(e.target.value)}/>
            </div>
            <button className="auth-btn" onClick={handleCashIn} disabled={loading}>
              {loading ? "Creating link..." : "Generate Payment Link"}
            </button>
            {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
            {result?.type==="cashin" && (
              <div style={{marginTop:12,padding:12,background:"#0a1f0a",borderRadius:8}}>
                <p style={{color:"#22c55e",margin:0}}>✓ Payment link created!</p>
                <p style={{color:"#94a3b8",fontSize:12}}>Ref: {result.referenceId}</p>
              </div>
            )}
          </div>
        )}

        {/* ── FLOWER ↔ USDT ─────────────────────────────────────────────── */}
        {tab==="flower-usdt" && (() => {
          const isF2U      = fuDirection === "flower-to-usdt";
          const fromLabel  = isF2U ? "FLOWER 🌸" : "USDT";
          const toLabel    = isF2U ? "USDT"       : "FLOWER 🌸";
          const fromSymbol = isF2U ? "🌸" : "$";
          const fromBal    = isF2U ? flowerBal : usdtBal;

          return (
            <div style={card}>
              <h3 style={{margin:"0 0 4px"}}>Swap {fromLabel} → {toLabel}</h3>
              <p style={{color:"#94a3b8",fontSize:13,marginTop:0,marginBottom:16}}>
                Internal swap between FLOWER and USDT. Rate fetched live from Katana DEX.
              </p>

              <div style={{marginBottom:16}}>
                <label style={{display:"block",marginBottom:6,color:"#94a3b8"}}>
                  FLOWER Network
                </label>
                <select
                  value={flowerChain}
                  onChange={e=>setFlowerChain(e.target.value)}
                  style={inp}
                >
                  <option value="RONIN">Ronin</option>
                  <option value="BASE">Base</option>
                  <option value="ETHEREUM" disabled>Ethereum (Soon)</option>
                  <option value="POLYGON" disabled>Polygon (Soon)</option>
                </select>
              </div>

              <div style={{
                background:"#121b2f",
                borderRadius:8,
                padding:"8px 12px",
                marginBottom:12,
                color:"#22c55e",
                fontSize:12
              }}>
                Active Network: {flowerChain}
              </div>

              <p style={{color:"#94a3b8",fontSize:13,marginTop:0,marginBottom:16}}>
                {flowerChain === "RONIN" ? "Swap FLOWER on Ronin." : "Swap FLOWER on Base."}
              </p>

              {/* Balance hint */}
              <div style={{
                background:"#121b2f", borderRadius:8, padding:"8px 12px",
                marginBottom:12, fontSize:12, color:"#94a3b8",
                display:"flex", justifyContent:"space-between"
              }}>
                <span>Available {isF2U ? "FLOWER" : "USDT"}</span>
                <span style={{color:"white", fontWeight:600}}>
                  {fromSymbol}{(+fromBal).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}
                </span>
              </div>

              {/* FROM */}
              <div style={{marginBottom:8}}>
                <label style={{color:"#94a3b8",fontSize:12}}>From ({fromLabel})</label>
                <input
                  style={inp} type="number" placeholder="0.00"
                  value={fuAmount}
                  onChange={e=>{ setFuAmount(e.target.value); setFuResult(null); }}
                />
              </div>

              {/* FLIP */}
              <div style={{display:"flex",justifyContent:"center",margin:"10px 0"}}>
                <button onClick={flipFu} title="Flip direction" style={{
                  background:"#1d2942", border:"1px solid #2d3f5e", borderRadius:"50%",
                  width:36, height:36, cursor:"pointer", fontSize:18, color:"#94a3b8",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>⇅</button>
              </div>

              {/* TO (preview) */}
              <div style={{marginBottom:16}}>
                <label style={{color:"#94a3b8",fontSize:12}}>To ({toLabel})</label>
                <div style={{...inp, marginTop:4, padding:10, minHeight:42, display:"flex", alignItems:"center"}}>
                  {fuQuoting
                    ? <span style={{color:"#94a3b8",fontSize:12}}>Getting rate...</span>
                    : fuQuote
                      ? <span style={{fontWeight:700,fontSize:16,color:"white"}}>{fuQuote.youGetLabel}</span>
                      : <span style={{color:"#4a5568"}}>0.00</span>
                  }
                </div>
              </div>

              {/* Quote detail */}
              {fuQuote && !fuQuoting && (
                <div style={{background:"#121b2f",borderRadius:8,padding:12,marginBottom:16}}>
                  <div style={{color:"#94a3b8",fontSize:12,marginBottom:4}}>{fuQuote.display}</div>
                  <div style={{color:"#22c55e",fontSize:20,fontWeight:700}}>You get {fuQuote.youGetLabel}</div>
                  {fuQuote.slippageLabel && (
                    <div style={{color:"#94a3b8",fontSize:12,marginTop:4}}>
                      Fee &amp; slippage: {fuQuote.slippageLabel}
                    </div>
                  )}
                </div>
              )}

              <button
                className="auth-btn"
                onClick={handleFlowerUsdtSwap}
                disabled={fuLoading || !fuAmount || !fuQuote}
                style={{background:"linear-gradient(135deg,#9333ea,#f59e0b)",border:"none"}}
              >
                {fuLoading ? "Swapping..." : `Swap ${fromLabel} → ${toLabel}`}
              </button>

              {fuError && <p style={{color:"#ef4444",marginTop:8,fontSize:13}}>{fuError}</p>}

              {fuResult && (
                <div style={{marginTop:12,padding:12,background:"#0a1f0a",borderRadius:8}}>
                  <p style={{color:"#22c55e",margin:0}}>✓ Swap successful!</p>
                  {fuResult.txRef && (
                    <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>Ref: {fuResult.txRef}</p>
                  )}
                  {fuResult.usdtOut && (
                    <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>
                      Received: ${fuResult.usdtOut.toFixed(4)} USDT
                    </p>
                  )}
                  {fuResult.flowerOut && (
                    <p style={{color:"#94a3b8",fontSize:12,margin:"4px 0"}}>
                      Received: 🌸 {fuResult.flowerOut.toFixed(4)} FLOWER
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </DashboardLayout>
  );
}
