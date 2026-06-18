import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";

const CHAINS = {
  ETHEREUM: { name:"Ethereum", symbol:"ETH",  color:"#627EEA", icon:"⬡", chainId:"0x1"    },
  POLYGON:  { name:"Polygon",  symbol:"MATIC", color:"#8247E5", icon:"⬟", chainId:"0x89"   },
  BASE:     { name:"Base",     symbol:"ETH",   color:"#0052FF", icon:"🔵", chainId:"0x2105" },
  RONIN:    { name:"Ronin",    symbol:"RON",   color:"#1273EA", icon:"🗡️", chainId:"0x7e4"  },
};

const PROVIDERS = [
  { id:"metamask", name:"MetaMask", icon:"🦊", getProvider: () => (window as any).ethereum },
  { id:"ronin",    name:"Ronin",    icon:"🗡️", getProvider: () => (window as any).ronin?.provider },
];

export default function WalletManager() {
  const [walletData, setWalletData]         = useState<any>(null);
  const [activeChain, setActiveChain]       = useState("ETHEREUM");
  const [loading, setLoading]               = useState(true);
  const [switching, setSwitching]           = useState(false);
  const [connecting, setConnecting]         = useState<string|null>(null);
  const [error, setError]                   = useState("");
  const [copied, setCopied]                 = useState(false);
  const [showQR, setShowQR]                 = useState(false);
  const canvasRef                           = useRef<HTMLCanvasElement>(null);

  useEffect(() => { fetchWallets(); }, []);

  useEffect(() => {
    if (showQR && walletData && canvasRef.current) {
      const addr = getActiveAddress();
      if (addr) QRCode.toCanvas(canvasRef.current, addr, { width:180, margin:2 });
    }
  }, [showQR, activeChain, walletData]);

  async function fetchWallets() {
    setLoading(true);
    try {
      const res  = await fetch("/api/v1/wallet/list", { credentials:"include" });
      const data = await res.json();
      setWalletData(data);
      if (data.activeChain) setActiveChain(data.activeChain);
    } catch { setError("Failed to load wallets"); }
    finally { setLoading(false); }
  }

  async function handleSwitchChain(chain: string) {
    setSwitching(true); setError("");
    try {
      await fetch("/api/v1/wallet/switch-chain", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ chain }),
      });
      setActiveChain(chain);
      setShowQR(false);
    } catch { setError("Failed to switch chain"); }
    finally { setSwitching(false); }
  }

  async function connectProvider(providerId: string) {
    setConnecting(providerId); setError("");
    try {
      const provider = PROVIDERS.find(p => p.id === providerId);
      if (!provider) return;
      const p = provider.getProvider();
      if (!p) { alert(`${provider.name} not installed`); return; }

      const accounts = await p.request({ method:"eth_requestAccounts" });
      const address  = accounts[0];
      const chainId  = await p.request({ method:"eth_chainId" });

      await fetch("/api/v1/wallet/link", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ address, provider: providerId, chainId }),
      });
      await fetchWallets();
    } catch(err:any) { setError(err.message); }
    finally { setConnecting(null); }
  }

  async function unlinkWallet(address: string) {
    try {
      await fetch("/api/v1/wallet/unlink", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ address }),
      });
      await fetchWallets();
    } catch { setError("Failed to unlink"); }
  }

  function getActiveAddress() {
    return walletData?.chainAddresses?.find((c:any) => c.chain === activeChain)?.address || null;
  }

  function copyAddress() {
    const addr = getActiveAddress();
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const chain    = CHAINS[activeChain as keyof typeof CHAINS];
  const address  = getActiveAddress();
  const balances = walletData?.balances || {};

  if (loading) return (
    <DashboardLayout>
      <div className="dashboard" style={{color:"#94a3b8"}}>Loading wallets...</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Wallet Manager</h2>

        {error && <p style={{color:"#ef4444",marginBottom:16}}>{error}</p>}

        {/* Balance Summary */}
        <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap" as const}}>
          {[["PHP","₱",balances.PHP||0],["USDT","$",balances.USDT||0],["USDC","$",balances.USDC||0],["FLOWER","🌸",balances.FLOWER||0],["RON","⚔️",balances.RON||0]].map(([cur,sym,bal])=>(
            <div key={cur as string} style={{background:"#0d1526",borderRadius:10,padding:"12px 20px",minWidth:130}}>
              <div style={{color:"#94a3b8",fontSize:11}}>{cur as string}</div>
              <div style={{color:"white",fontSize:18,fontWeight:700}}>{sym as string}{(+bal).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            </div>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,maxWidth:860}}>

          {/* Chain Selector */}
          <div style={{background:"#0d1526",borderRadius:12,padding:20}}>
            <h3 style={{margin:"0 0 16px",fontSize:14,color:"#94a3b8",textTransform:"uppercase" as const,letterSpacing:1}}>Select Network</h3>
            <div style={{display:"flex",flexDirection:"column" as const,gap:10}}>
              {Object.entries(CHAINS).map(([key, c]) => {
                const chainAddr = walletData?.chainAddresses?.find((a:any) => a.chain === key);
                const isActive  = activeChain === key;
                return (
                  <button key={key} onClick={() => handleSwitchChain(key)} disabled={switching} style={{
                    display:"flex", alignItems:"center", gap:12,
                    padding:"12px 16px", borderRadius:10,
                    border:`2px solid ${isActive ? c.color : "transparent"}`,
                    background: isActive ? c.color+"22" : "#121b2f",
                    color:"white", cursor:"pointer", textAlign:"left" as const,
                    transition:"all 0.2s",
                  }}>
                    <span style={{fontSize:20}}>{c.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:14}}>{c.name}</div>
                      <div style={{color:"#94a3b8",fontSize:11,fontFamily:"monospace"}}>
                        {chainAddr?.address ? `${chainAddr.address.slice(0,8)}...${chainAddr.address.slice(-4)}` : "Not generated"}
                      </div>
                    </div>
                    {isActive && <span style={{color:c.color,fontSize:12,fontWeight:700}}>ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Chain Wallet */}
          <div style={{background:"#0d1526",borderRadius:12,padding:20}}>
            <h3 style={{margin:"0 0 4px",fontSize:14,color:"#94a3b8",textTransform:"uppercase" as const,letterSpacing:1}}>
              {chain?.name} Wallet
            </h3>
            <div style={{width:12,height:12,borderRadius:"50%",background:chain?.color,display:"inline-block",marginBottom:16}}/>

            {address && !["ETHEREUM","POLYGON"].includes(activeChain) ? (
              <>
                {/* QR Toggle */}
                <button onClick={() => setShowQR(!showQR)} style={{
                  width:"100%",padding:"8px",borderRadius:8,border:"1px solid #1d2942",
                  background:"#121b2f",color:"#94a3b8",cursor:"pointer",marginBottom:12,fontSize:12
                }}>
                  {showQR ? "Hide QR" : "Show QR Code"}
                </button>

                {showQR && (
                  <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
                    <div style={{background:"white",padding:10,borderRadius:10}}>
                      <canvas ref={canvasRef}/>
                    </div>
                  </div>
                )}

                {/* Address */}
                <div style={{background:"#121b2f",borderRadius:8,padding:12,marginBottom:12}}>
                  <div style={{color:"#94a3b8",fontSize:11,marginBottom:6}}>Deposit Address ({chain?.name})</div>
                  <div style={{color:"#22c55e",fontFamily:"monospace",fontSize:12,wordBreak:"break-all" as const,marginBottom:8}}>
                    {address}
                  </div>
                  <button onClick={copyAddress} style={{
                    width:"100%",padding:"8px",borderRadius:6,border:"none",
                    background: copied ? "#166534" : "#1d2942",
                    color: copied ? "#22c55e" : "white",
                    cursor:"pointer",fontSize:12,
                  }}>
                    {copied ? "✓ Copied!" : "Copy Address"}
                  </button>
                </div>

                {/* Warning */}
                <div style={{padding:10,background:"#1a1200",borderRadius:8,border:"1px solid #854d0e"}}>
                  <p style={{color:"#fbbf24",fontSize:11,margin:0}}>
                    ⚠ Only send <strong>FLOWER</strong> on <strong>{chain?.name}</strong> to this address.
                  </p>
                </div>
              </>
            ) : (
              <p style={{color:"#94a3b8",fontSize:13}}>No address generated for this chain yet.</p>
            )}
          </div>

          {/* Connect External Wallets */}
          <div style={{background:"#0d1526",borderRadius:12,padding:20}}>
            <h3 style={{margin:"0 0 16px",fontSize:14,color:"#94a3b8",textTransform:"uppercase" as const,letterSpacing:1}}>Link External Wallet</h3>
            <div style={{display:"flex",flexDirection:"column" as const,gap:10}}>
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => connectProvider(p.id)} disabled={!!connecting} style={{
                  display:"flex",alignItems:"center",gap:12,
                  padding:"12px 16px",borderRadius:10,
                  border:"1px solid #1d2942",background:"#121b2f",
                  color:"white",cursor:"pointer",
                }}>
                  <span style={{fontSize:20}}>{p.icon}</span>
                  <span style={{fontWeight:600}}>{p.name}</span>
                  {connecting===p.id && <span style={{color:"#94a3b8",fontSize:12,marginLeft:"auto"}}>Connecting...</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Linked Wallets */}
          <div style={{background:"#0d1526",borderRadius:12,padding:20}}>
            <h3 style={{margin:"0 0 16px",fontSize:14,color:"#94a3b8",textTransform:"uppercase" as const,letterSpacing:1}}>Linked Wallets</h3>
            {walletData?.wallets?.length === 0 || !walletData?.wallets ? (
              <p style={{color:"#94a3b8",fontSize:13}}>No external wallets linked yet.</p>
            ) : walletData.wallets.map((w:any, i:number) => (
              <div key={i} style={{background:"#121b2f",borderRadius:8,padding:12,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:"white",fontSize:12,fontWeight:600}}>{w.provider?.toUpperCase()} · {w.network}</div>
                    <div style={{color:"#94a3b8",fontFamily:"monospace",fontSize:11}}>{w.address?.slice(0,10)}...{w.address?.slice(-6)}</div>
                  </div>
                  <button onClick={() => unlinkWallet(w.address)} style={{
                    padding:"4px 10px",borderRadius:6,border:"1px solid #ef444440",
                    background:"transparent",color:"#ef4444",cursor:"pointer",fontSize:11
                  }}>Unlink</button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
