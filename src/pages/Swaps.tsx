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
  const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);
  const [cashInAmount, setCashInAmount]   = useState("");
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState<any>(null);
  const [cashInMode, setCashInMode]       = useState<"online"|"bank">("online");
  const [depositChannel, setDepositChannel] = useState<"BANK"|"MAYA">("BANK");
  const [bankDeposit, setBankDeposit]     = useState<any>(null);
  const [bankDepositLoading, setBankDepositLoading] = useState(false);
  const [bankDepositError, setBankDepositError]     = useState("");
  const [copied, setCopied]               = useState(false);
  const [error, setError]                 = useState("");
  const [quote, setQuote]                 = useState<any>(null);
  const [quoting, setQuoting]             = useState(false);
  const [balances, setBalances]           = useState<any>({});
  const [connectedWallet, setConnectedWallet] = useState<string|null>(null);
  const [walletAddress, setWalletAddress]     = useState<string|null>(null);

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

  useEffect(() => {
    fetch("/api/v1/bank/list", { credentials:"include" })
      .then(r => r.json()).then(d => setLinkedAccounts(d.banks || []));
  }, []);

  // Restore an in-flight deposit after a page refresh. Without this, reloading
  // the page cleared local state while the server still had a PENDING record,
  // letting someone bypass the lock simply by refreshing.
  useEffect(() => {
    fetch("/api/v1/deposit/pending", { credentials:"include" })
      .then(r => r.json())
      .then(d => {
        if (d?.deposit) {
          setBankDeposit({ ...d.deposit, status: d.deposit.status || "PENDING" });
          setCashInMode("bank");
          setTab("cashin");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function fetchBal() {
      fetch("/api/v1/wallet/balances", { credentials:"include" })
        .then(r => r.json()).then(d => setBalances(d.balances || d || {}))
        .catch(() => {});
    }
    fetchBal();
    const iv = setInterval(fetchBal, 60000);
    return () => clearInterval(iv);
  }, [result, fuResult]);

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

  useEffect(() => {
    if (!fuAmount || isNaN(parseFloat(fuAmount))) { setFuQuote(null); return; }
    const from = fuDirection === "flower-to-usdt" ? "FLOWER" : "USDC";
    const to   = fuDirection === "flower-to-usdt" ? "USDC"   : "FLOWER";
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
      const from = fuDirection === "flower-to-usdt" ? "FLOWER" : "USDC";
      const to   = fuDirection === "flower-to-usdt" ? "USDC"   : "FLOWER";
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

  async function handleBankDepositRequest() {
    setBankDepositLoading(true); setBankDepositError("");
    try {
      const res = await fetch("/api/v1/deposit/request", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ amount: parseFloat(cashInAmount), channel: depositChannel })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setBankDeposit({ ...data, status: "PENDING" });
    } catch(err:any) { setBankDepositError(err.message); }
    finally { setBankDepositLoading(false); }
  }

  function copyRef() {
    if (!bankDeposit?.referenceId) return;
    navigator.clipboard.writeText(bankDeposit.referenceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function cancelBankDeposit() {
    if (!bankDeposit?.referenceId) { setBankDeposit(null); return; }
    setBankDepositLoading(true);
    try {
      const res = await fetch("/api/v1/deposit/cancel", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId: bankDeposit.referenceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      setBankDeposit(null);
      setCashInAmount("");
    } catch (err: any) {
      // Deposit may have already resolved server-side (e.g. credited a
      // moment ago) — refresh from the server instead of leaving stale
      // local state that disagrees with what actually happened.
      setBankDepositError(err.message);
      try {
        const r = await fetch("/api/v1/deposit/pending", { credentials: "include" });
        const d = await r.json();
        setBankDeposit(d?.deposit ? { ...d.deposit } : null);
      } catch {}
    } finally {
      setBankDepositLoading(false);
    }
  }

  // The page is locked to the Cash In flow whenever there's a live PENDING
  // bank/Maya deposit request — until it's credited, expires, or the user
  // explicitly cancels it. This stops someone from wandering off to another
  // tab mid-deposit and losing track of an open request.
  const depositLocked = !!bankDeposit && bankDeposit.status === "PENDING";

  useEffect(() => {
    if (depositLocked && tab !== "cashin") setTab("cashin");
  }, [depositLocked, tab]);

  useEffect(() => {
    if (!bankDeposit?.referenceId || bankDeposit.status !== "PENDING") return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/deposit/status/${bankDeposit.referenceId}`, { credentials:"include" });
        const data = await res.json();
        if (data?.deposit?.status && data.deposit.status !== "PENDING") {
          setBankDeposit((prev:any) => ({ ...prev, status: data.deposit.status }));
        }
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [bankDeposit?.referenceId, bankDeposit?.status]);

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

        <div style={{marginBottom:24}}>
          {depositLocked && (
            <div style={{
              background:"#2a2410", border:"1px solid #eab308", borderRadius:8,
              padding:"10px 14px", marginBottom:12, color:"#eab308", fontSize:13,
            }}>
              🔒 You have a deposit awaiting confirmation. Other actions are locked until it's credited, expires, or you cancel it.
            </div>
          )}
          <button style={{...tabStyle("crypto-php"), opacity: depositLocked?0.4:1, cursor: depositLocked?"not-allowed":"pointer"}} disabled={depositLocked} onClick={()=>{setTab("crypto-php");setError("");setResult(null);setQuote(null);}}>
            Crypto → PHP
          </button>
          <button style={{...tabStyle("php-usdt"), opacity: depositLocked?0.4:1, cursor: depositLocked?"not-allowed":"pointer"}} disabled={depositLocked} onClick={()=>{setTab("php-usdt");setError("");setResult(null);setQuote(null);}}>
            PHP → USDT/USDC
          </button>
          <button style={{...tabStyle("cashout"), opacity: depositLocked?0.4:1, cursor: depositLocked?"not-allowed":"pointer"}} disabled={depositLocked} onClick={()=>{setTab("cashout");setError("");setResult(null);}}>
            Cash Out
          </button>
          <button style={tabStyle("cashin")} onClick={()=>{setTab("cashin");setError("");setResult(null);}}>
            Cash In
          </button>
          <button
            style={{
              ...tabStyle("flower-usdt"),
              background: tab==="flower-usdt"
                ? "linear-gradient(135deg,#9333ea,#f59e0b)"
                : "#1d2942",
              opacity: depositLocked?0.4:1, cursor: depositLocked?"not-allowed":"pointer"
            }}
            disabled={depositLocked}
            onClick={()=>{setTab("flower-usdt");setFuError("");setFuResult(null);}}
          >
            🌸 FLOWER ↔ USDC
          </button>
        </div>

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

        {tab==="cashout" && (
          <div style={card}>
            <h3 style={{margin:"0 0 4px"}}>Cash Out</h3>
            <p style={{color:"#94a3b8",fontSize:13,marginTop:0}}>Send PHP to your linked GCash, Maya, or Bank account.</p>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Amount (PHP)</label>
              <input style={inp} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{color:"#94a3b8",fontSize:12}}>Account</label>
              {linkedAccounts.length === 0 ? (
                <p style={{color:"#ef4444",fontSize:13}}>No linked accounts yet. Add one in Profile first.</p>
              ) : (
                <select style={inp} value={accountNumber} onChange={e=>{
                  const acc = linkedAccounts.find(a=>a.accountNumber===e.target.value);
                  setAccountNumber(e.target.value);
                  setChannel(acc?.provider === "bank" ? (acc?.bankName || "BANK") : (acc?.provider || "").toUpperCase());
                  setReceiverName(acc?.accountName || "");
                }}>
                  <option value="">Select account</option>
                  {linkedAccounts.map(a => (
                    <option key={a._id} value={a.accountNumber}>
                      {a.provider === "bank" ? a.bankName : a.provider.toUpperCase()} — {a.accountNumber} ({a.accountName})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {amount && accountNumber && (() => {
              const php = parseFloat(amount || "0");
              const fee = parseFloat((php * 0.015).toFixed(2));
              return (
                <div style={{background:"#121b2f",borderRadius:8,padding:12,marginBottom:16}}>
                  <div style={{color:"#94a3b8",fontSize:12}}>Fee: ₱{fee.toFixed(2)} (1.5%)</div>
                  <div style={{color:"white",fontSize:16,fontWeight:600}}>
                    You'll receive: ₱{(php - fee).toFixed(2)}
                  </div>
                </div>
              );
            })()}
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

        {tab==="cashin" && (
          <div style={card}>
            <h3 style={{margin:"0 0 4px"}}>Cash In</h3>
            <p style={{color:"#94a3b8",fontSize:13,marginTop:0}}>Add PHP to your balance.</p>

            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <button onClick={()=>{setCashInMode("online");setBankDeposit(null);setBankDepositError("");}} style={{
                flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
                background: cashInMode==="online" ? "#3b82f6" : "#1d2942", color:"white"
              }}>Online (GCash/Maya/Card) — Coming Soon</button>
              <button onClick={()=>{setCashInMode("bank");setError("");setResult(null);}} style={{
                flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
                background: cashInMode==="bank" ? "#3b82f6" : "#1d2942", color:"white"
              }}>Bank Transfer</button>
            </div>

            {cashInMode==="online" && (
              <>
                <div style={{marginBottom:16}}>
                  <label style={{color:"#94a3b8",fontSize:12}}>Amount (PHP)</label>
                  <input style={inp} type="number" placeholder="Min ₱20" value={cashInAmount} onChange={e=>setCashInAmount(e.target.value)}/>
                </div>
                <button className="auth-btn" disabled={true} style={{opacity:0.5,cursor:"not-allowed"}}>
                  "🚧 Coming Soon"
                </button>
                {error && <p style={{color:"#ef4444",marginTop:8}}>{error}</p>}
                {result?.type==="cashin" && (
                  <div style={{marginTop:12,padding:12,background:"#0a1f0a",borderRadius:8}}>
                    <p style={{color:"#22c55e",margin:0}}>✓ Payment link created!</p>
                    <p style={{color:"#94a3b8",fontSize:12}}>Ref: {result.referenceId}</p>
                  </div>
                )}
              </>
            )}

            {cashInMode==="bank" && (
              <>
                {!bankDeposit && (
                  <>
                    <p style={{color:"#94a3b8",fontSize:13,marginTop:0}}>
                      Generate a reference code, send the exact amount via bank transfer, then wait for confirmation.
                    </p>
                    <div style={{display:"flex",gap:8,marginBottom:12}}>
                      <button onClick={()=>setDepositChannel("BANK")} style={{
                        flex:1,padding:"6px 0",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,
                        background: depositChannel==="BANK" ? "#3b82f6" : "#1d2942", color:"white"
                      }}>Mari Bank</button>
                      <button onClick={()=>setDepositChannel("MAYA")} style={{
                        flex:1,padding:"6px 0",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,
                        background: depositChannel==="MAYA" ? "#3b82f6" : "#1d2942", color:"white"
                      }}>Maya</button>
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{color:"#94a3b8",fontSize:12}}>Amount (PHP)</label>
                      <input style={inp} type="number" placeholder="Min ₱20" value={cashInAmount} onChange={e=>setCashInAmount(e.target.value)}/>
                    </div>
                    <button className="auth-btn" onClick={handleBankDepositRequest} disabled={bankDepositLoading || !cashInAmount}>
                      {bankDepositLoading ? "Generating..." : "Generate Deposit Reference"}
                    </button>
                    {bankDepositError && <p style={{color:"#ef4444",marginTop:8}}>{bankDepositError}</p>}
                  </>
                )}

                {bankDeposit && (
                  <div>
                    <div style={{
                      display:"inline-block",padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:700,marginBottom:12,
                      background: bankDeposit.status==="CREDITED" ? "#0a1f0a" : bankDeposit.status==="EXPIRED" ? "#2a0a0a" : "#2a2410",
                      color: bankDeposit.status==="CREDITED" ? "#22c55e" : bankDeposit.status==="EXPIRED" ? "#ef4444" : "#eab308"
                    }}>
                      {bankDeposit.status==="CREDITED" ? "✓ Credited" : bankDeposit.status==="EXPIRED" ? "✗ Expired" : "⏳ Pending Confirmation"}
                    </div>

                    <div style={{background:"#121b2f",borderRadius:8,padding:14,marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{color:"#94a3b8",fontSize:12}}>{bankDeposit.channel === "MAYA" ? "Maya Number" : "Bank Account"}</span>
                        <span style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{color:"white",fontSize:13,fontWeight:600}}>
                            {bankDeposit.channel === "MAYA" ? bankDeposit.instructions?.maya : bankDeposit.instructions?.bank}
                          </span>
                          <button onClick={() => navigator.clipboard.writeText(bankDeposit.channel === "MAYA" ? bankDeposit.instructions?.maya : bankDeposit.instructions?.bank)} style={{
                            background:"#1d2942",border:"1px solid #2d3f5e",borderRadius:6,padding:"4px 8px",
                            color:"white",fontSize:11,cursor:"pointer"
                          }}>Copy</button>
                        </span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{color:"#94a3b8",fontSize:12}}>Account Name</span>
                        <span style={{color:"white",fontSize:13,fontWeight:600}}>{bankDeposit.instructions?.name}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{color:"#94a3b8",fontSize:12}}>Amount</span>
                        <span style={{color:"white",fontSize:13,fontWeight:600}}>₱{(+bankDeposit.amount).toFixed(2)}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:"#94a3b8",fontSize:12}}>Reference (required)</span>
                        <span style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{color:"#fbbf24",fontSize:14,fontWeight:700,fontFamily:"monospace"}}>{bankDeposit.referenceId}</span>
                          <button onClick={copyRef} style={{
                            background:"#1d2942",border:"1px solid #2d3f5e",borderRadius:6,padding:"4px 8px",
                            color:"white",fontSize:11,cursor:"pointer"
                          }}>{copied ? "Copied" : "Copy"}</button>
                        </span>
                      </div>
                    </div>

                    <div style={{textAlign:"center",margin:"12px 0"}}>
                      <img
                        src={bankDeposit.channel === "MAYA" ? "/qr/maya-qr.png" : "/qr/maribank-qr.png"}
                        alt={`${bankDeposit.channel} QR code`}
                        style={{width:200,height:200,borderRadius:8,background:"white",padding:8}}
                      />
                      <p style={{color:"#94a3b8",fontSize:11,marginTop:6}}>Scan to pay via {bankDeposit.channel === "MAYA" ? "Maya" : "your banking app"}</p>
                    </div>

                    <p style={{color:"#94a3b8",fontSize:12,marginBottom:16}}>
                      Include reference <b style={{color:"white"}}>{bankDeposit.referenceId}</b> in your transfer memo/notes. Mismatched amounts or missing references will delay confirmation.
                    </p>

                    {bankDeposit.status==="CREDITED" && (
                      <div style={{marginBottom:16,padding:14,background:"#0a1f0a",border:"1px solid #22c55e",borderRadius:8}}>
                        <p style={{color:"#22c55e",margin:0,fontSize:15,fontWeight:700}}>✓ Deposit confirmed!</p>
                        <p style={{color:"#94a3b8",fontSize:12,margin:"6px 0 0"}}>
                          ₱{(+bankDeposit.amount).toFixed(2)} has been credited to your PHP balance.
                        </p>
                        <p style={{color:"#94a3b8",fontSize:11,margin:"4px 0 0"}}>Ref: {bankDeposit.referenceId}</p>
                      </div>
                    )}

                    {bankDeposit.status==="EXPIRED" && (
                      <div style={{marginBottom:16,padding:14,background:"#2a0a0a",border:"1px solid #ef4444",borderRadius:8}}>
                        <p style={{color:"#ef4444",margin:0,fontSize:15,fontWeight:700}}>✗ This request expired</p>
                        <p style={{color:"#94a3b8",fontSize:12,margin:"6px 0 0"}}>
                          No payment was matched to this reference in time. Start a new deposit below if you still want to send funds.
                        </p>
                      </div>
                    )}

                    {bankDeposit.status==="PENDING" && (
                      <p style={{color:"#94a3b8",fontSize:12}}>Checking for confirmation automatically...</p>
                    )}

                    <button onClick={bankDeposit.status==="PENDING" ? cancelBankDeposit : ()=>{setBankDeposit(null);setCashInAmount("");}} disabled={bankDepositLoading} style={{
                      background:"#1d2942",border:"1px solid #2d3f5e",borderRadius:8,padding:"8px 16px",
                      color:"white",fontSize:13,cursor: bankDepositLoading ? "wait" : "pointer", opacity: bankDepositLoading?0.6:1
                    }}>{bankDeposit.status==="PENDING" ? (bankDepositLoading ? "Cancelling..." : "Cancel") : "New Deposit"}</button>
                    {bankDepositError && <p style={{color:"#ef4444",marginTop:8,fontSize:12}}>{bankDepositError}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab==="flower-usdt" && (() => {
          const isF2U      = fuDirection === "flower-to-usdt";
          const fromLabel  = isF2U ? "FLOWER 🌸" : "USDC";
          const toLabel    = isF2U ? "USDC"       : "FLOWER 🌸";
          const fromSymbol = isF2U ? "🌸" : "$";
          const fromBal    = isF2U ? flowerBal : usdcBal;

          return (
            <div style={card}>
              <h3 style={{margin:"0 0 4px"}}>Swap FLOWER 🌸 → USDC</h3>
              <p style={{color:"#94a3b8",fontSize:13,marginTop:0,marginBottom:16}}>
                Internal swap between FLOWER and USDC. Rate fetched live from Uniswap V3 on Base.
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
                {flowerChain === "RONIN" ? "Swap FLOWER on Base via Uniswap V3." : "Swap FLOWER on Base via Uniswap V3."}
              </p>

              <div style={{
                background:"#121b2f", borderRadius:8, padding:"8px 12px",
                marginBottom:12, fontSize:12, color:"#94a3b8",
                display:"flex", justifyContent:"space-between"
              }}>
                <span>Available {isF2U ? "FLOWER" : "USDC"}</span>
                <span style={{color:"white", fontWeight:600}}>
                  {fromSymbol}{(+fromBal).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}
                </span>
              </div>

              <div style={{marginBottom:8}}>
                <label style={{color:"#94a3b8",fontSize:12}}>From ({fromLabel})</label>
                <input
                  style={inp} type="number" placeholder="0.00"
                  value={fuAmount}
                  onChange={e=>{ setFuAmount(e.target.value); setFuResult(null); }}
                />
              </div>

              <div style={{display:"flex",justifyContent:"center",margin:"10px 0"}}>
                <button onClick={flipFu} title="Flip direction" style={{
                  background:"#1d2942", border:"1px solid #2d3f5e", borderRadius:"50%",
                  width:36, height:36, cursor:"pointer", fontSize:18, color:"#94a3b8",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>⇅</button>
              </div>

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
                      Received: ${fuResult.usdtOut.toFixed(4)} USDC
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
