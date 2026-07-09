import DashboardLayout from "../banking/components/DashboardLayout";
import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";

const CHAINS = {
  BASE: {
    name: "Base",
    icon: "🔵",
    color: "#0052FF",
    assets: ["FLOWER", "USDC", "ETH"],
    configured: true
  },
  RONIN: {
    name: "Ronin",
    icon: "🗡️",
    color: "#1273EA",
    assets: ["FLOWER", "RON", "AXS", "SLP", "PIXEL"],
    configured: true
  },
  ETHEREUM: {
    name: "Ethereum",
    icon: "⬡",
    color: "#627EEA",
    assets: ["ETH", "USDC", "USDT"],
    configured: false
  },
  POLYGON: {
    name: "Polygon",
    icon: "⬟",
    color: "#8247E5",
    assets: ["MATIC", "USDC", "USDT"],
    configured: false
  }
};

export default function WalletManager() {

    const [wallet,setWallet]=useState<any>(null);
    const [activeChain,setActiveChain]=useState("BASE");
    const [showQR,setShowQR]=useState(false);
    const [copied,setCopied]=useState(false);
    const [onchain,setOnchain]=useState<any>({});

    const qrRef=useRef<HTMLCanvasElement>(null);

    useEffect(()=>{
        loadWallet();
        loadOnchainBalances();
    },[]);

    // Real on-chain balances, same endpoint the Swaps page uses. Only
    // BASE and RONIN are actually queried server-side today — Ethereum
    // and Polygon addresses are derived but not live-checked, so those
    // chains simply won't have a balance to show next to their chips yet.
    async function loadOnchainBalances(){
        try{
            const res=await fetch("/api/v1/wallet/balances",{
                credentials:"include"
            });
            const json=await res.json();
            setOnchain(json?.onchain || {});
        }catch{
            // Leave onchain as {} — asset chips just render without a
            // balance figure rather than showing a misleading number.
        }
    }

    useEffect(()=>{
        if(showQR && qrRef.current && address){
            QRCode.toCanvas(qrRef.current,address,{
                width:180
            });
        }
    },[showQR,activeChain,wallet]);

    async function loadWallet(){

        const res=await fetch("/api/v1/wallet/list",{
            credentials:"include"
        });

        const json=await res.json();

        setWallet(json);
    }

    const chain=CHAINS[activeChain as keyof typeof CHAINS];

    // Guard: if activeChain somehow points at an unconfigured chain
    // (e.g. stale state), snap back to the first configured chain.
    useEffect(()=>{
        if(!chain.configured){
            const firstConfigured = Object.keys(CHAINS).find(
                k=>CHAINS[k as keyof typeof CHAINS].configured
            );
            if(firstConfigured) setActiveChain(firstConfigured);
        }
    },[activeChain]);

    // Backend (`GET /api/v1/wallet/list` -> walletController.getWallets) returns
    // the per-chain data under `chains`, not `chainAddresses` - using the wrong
    // key here silently resolved to `undefined` (optional chaining swallows it),
    // which is why the address field and QR code rendered blank instead of
    // erroring visibly.
    const address=
        wallet?.chains?.find(
            (c:any)=>c.chain===activeChain
        )?.address;

    function copy(){

        if(!address) return;

        navigator.clipboard.writeText(address);

        setCopied(true);

        setTimeout(()=>{
            setCopied(false);
        },2000);

    }

    return(

    <DashboardLayout>

        <div className="dashboard">

            <h2>Receive Assets</h2>

            <div
                style={{
                    display:"grid",
                    gridTemplateColumns:"260px 1fr",
                    gap:20
                }}
            >

                {/* LEFT */}

                <div
                    style={{
                        background:"#0d1526",
                        borderRadius:12,
                        padding:20
                    }}
                >

                    <h3>Select Network</h3>

                    {Object.entries(CHAINS).map(([key,c])=>(

                        <button

                            key={key}

                            disabled={!c.configured}

                            onClick={()=>{

                                if(!c.configured) return;

                                setActiveChain(key);

                                setShowQR(false);

                            }}

                            style={{

                                width:"100%",
                                marginBottom:10,
                                padding:12,

                                borderRadius:8,

                                border:key===activeChain
                                    ?`2px solid ${c.color}`
                                    :"1px solid #1d2942",

                                background:"#121b2f",

                                color: c.configured ? "white" : "#5b6472",

                                textAlign:"left",

                                cursor: c.configured ? "pointer" : "not-allowed",

                                display:"flex",

                                justifyContent:"space-between",

                                alignItems:"center"

                            }}

                        >

                            <span>{c.icon} {c.name}</span>

                            {!c.configured &&

                                <span
                                    style={{
                                        fontSize:11,
                                        padding:"2px 8px",
                                        borderRadius:999,
                                        background:"#3f2d0a",
                                        color:"#fbbf24",
                                        fontWeight:600
                                    }}
                                >
                                    Coming Soon
                                </span>

                            }

                        </button>

                    ))}

                </div>

                {/* RIGHT */}

                <div
                    style={{
                        background:"#0d1526",
                        borderRadius:12,
                        padding:24
                    }}
                >

                    {!chain.configured ? (

                        <div
                            style={{
                                padding:"60px 20px",
                                textAlign:"center",
                                color:"#94a3b8"
                            }}
                        >

                            <div style={{fontSize:40,marginBottom:10}}>{chain.icon}</div>

                            <h2 style={{color:"white"}}>{chain.name}</h2>

                            <p style={{marginTop:10}}>
                                This network hasn't been configured yet. Deposits
                                will be enabled once it's live.
                            </p>

                        </div>

                    ) : (

                    <>

                    <h2>

                        {chain.icon}

                        {" "}

                        {chain.name}

                    </h2>

                    <p
                        style={{
                            color:"#94a3b8"
                        }}
                    >

                        Deposit address

                    </p>

                    <div
                        style={{
                            background:"#121b2f",
                            padding:15,
                            borderRadius:8
                        }}
                    >

                        <code
                            style={{
                                wordBreak:"break-all",
                                color:"#22c55e"
                            }}
                        >
                            {address}
                        </code>

                    </div>

                    <button
                        onClick={copy}
                        style={{
                            marginTop:12
                        }}
                    >

                        {copied
                            ?"Copied"
                            :"Copy Address"}

                    </button>

                    <button
                        onClick={()=>setShowQR(!showQR)}
                        style={{
                            marginLeft:10
                        }}
                    >

                        {showQR
                            ?"Hide QR"
                            :"Show QR"}

                    </button>

                    {showQR &&

                        <div
                            style={{
                                marginTop:20,
                                background:"white",
                                display:"inline-block",
                                padding:10,
                                borderRadius:8
                            }}
                        >

                            <canvas ref={qrRef}/>

                        </div>

                    }

                    <hr
                        style={{
                            margin:"25px 0",
                            borderColor:"#1d2942"
                        }}
                    />

                    <h3>

                        Supported Assets

                    </h3>

                    <div
                        style={{
                            display:"flex",
                            gap:10,
                            flexWrap:"wrap"
                        }}
                    >

                        {chain.assets.map(asset=>{

                            // "ETH" and "RON" are each chain's native currency,
                            // reported under `native` rather than their own
                            // token key in the balances response.
                            const isNative = asset === "ETH" || asset === "RON";
                            const chainData = onchain?.[activeChain];
                            const liveBalance = chainData
                                ? (isNative ? chainData.native : chainData[asset])
                                : undefined;

                            return (

                                <div

                                    key={asset}

                                    style={{

                                        padding:"8px 14px",

                                        borderRadius:999,

                                        background:"#121b2f",

                                        color:"white",

                                        display:"flex",

                                        alignItems:"center",

                                        gap:8

                                    }}

                                >

                                    <span>✓ {asset}</span>

                                    {typeof liveBalance === "number" && (

                                        <span style={{color:"#22c55e",fontSize:12,fontWeight:600}}>

                                            {liveBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}

                                        </span>

                                    )}

                                </div>

                            );

                        })}

                    </div>

                    <div
                        style={{
                            marginTop:25,
                            padding:15,
                            borderRadius:8,
                            background:"#1a1200",
                            border:"1px solid #854d0e",
                            color:"#fbbf24"
                        }}
                    >

                        Only send supported assets on the selected network.
                        Sending unsupported assets may result in permanent loss.

                    </div>

                    </>

                    )}

                </div>

            </div>

        </div>

    </DashboardLayout>

    );

}
