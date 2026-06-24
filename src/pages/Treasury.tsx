import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect } from "react";

const card = { background:"#0d1526", borderRadius:12, padding:20 } as const;
const lbl  = { color:"#94a3b8", fontSize:11, textTransform:"uppercase" as const, letterSpacing:1, marginBottom:6, display:"block" as const };
type Period = "day"|"week"|"month"|"year"|"all";

function sumByCurrency(arr: any[]) {
  const m: Record<string,{total:number,count:number}> = {};
  arr.forEach(r => { const k = r._id; if (!m[k]) m[k]={total:0,count:0}; m[k].total+=r.total; m[k].count+=r.count; });
  return m;
}

export default function Treasury() {
  const [fees,    setFees]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState<Period>("week");
  const [wallets, setWallets] = useState<any[]>([]);
  const [tab,     setTab]     = useState<"fees"|"wallets">("fees");

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/treasury/fees",    {credentials:"include"}).then(r=>r.json()),
      fetch("/api/v1/treasury/wallets", {credentials:"include"}).then(r=>r.json()),
    ]).then(([f,w]) => { setFees(f); setWallets(w.wallets||[]); }).finally(()=>setLoading(false));
  }, []);

  const periodData = fees ? {
    day:   sumByCurrency(fees.day   ||[]),
    week:  sumByCurrency(fees.week  ||[]),
    month: sumByCurrency(fees.month ||[]),
    year:  sumByCurrency(fees.year  ||[]),
    all:   sumByCurrency(fees.all   ||[]),
  } : null;

  const current = periodData?.[period] || {};
  const byType  = fees?.byType || [];

  // Separate fee types
  const fxFees      = byType.filter((r:any) => ['crypto_swap','flower_swap'].includes(r._id.type));
  const cashoutFees = byType.filter((r:any) => r._id.type === 'cashout');
  const otherFees   = byType.filter((r:any) => !['crypto_swap','flower_swap','cashout'].includes(r._id.type));

  const tabBtn = (t:string) => ({padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,marginRight:8,background:tab===t?"#3b82f6":"#1d2942",color:"white"} as const);
  const pBtn   = (p:Period,label:string) => ({padding:"6px 14px",borderRadius:6,border:period===p?"1px solid #22c55e44":"1px solid transparent",cursor:"pointer",fontWeight:600,fontSize:12,marginRight:6,background:period===p?"#22c55e22":"#1d2942",color:period===p?"#22c55e":"#94a3b8"} as const);

  if (loading) return <DashboardLayout><div className="dashboard" style={{color:"#94a3b8"}}>Loading treasury...</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="dashboard">
        <h2>Treasury</h2>
        <div style={{marginBottom:20}}>
          <button style={tabBtn("fees")}    onClick={()=>setTab("fees")}>Fee Analytics</button>
          <button style={tabBtn("wallets")} onClick={()=>setTab("wallets")}>Wallets</button>
        </div>

        {tab==="fees" && (
          <>
            {/* Period Selector */}
            <div style={{marginBottom:20}}>
              {(["day","week","month","year","all"] as Period[]).map((p,_,__)=>(
                <button key={p} style={pBtn(p, p==="day"?"24h":p==="week"?"7 Days":p==="month"?"30 Days":p==="year"?"365 Days":"All Time")}
                  onClick={()=>setPeriod(p)}>
                  {p==="day"?"24h":p==="week"?"7 Days":p==="month"?"30 Days":p==="year"?"365 Days":"All Time"}
                </button>
              ))}
            </div>

            {/* Summary cards for selected period */}
            <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap"}}>
              {Object.keys(current).length===0
                ? <div style={{...card,color:"#94a3b8",fontSize:13}}>No fees in this period.</div>
                : Object.entries(current).map(([cur,data]:any)=>(
                  <div key={cur} style={{...card,minWidth:160}}>
                    <span style={lbl}>{cur} Collected</span>
                    <div style={{color:"#ef4444",fontSize:24,fontWeight:700,marginBottom:4}}>{data.total.toFixed(6)}</div>
                    <div style={{color:"#94a3b8",fontSize:12}}>{data.count} transactions</div>
                  </div>
                ))
              }
            </div>

            {/* All-time comparison row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:24}}>
              {(["day","week","month","year","all"] as Period[]).map(p=>{
                const d=periodData?.[p]||{};
                const label=p==="day"?"24h":p==="week"?"7d":p==="month"?"30d":p==="year"?"365d":"All";
                return (
                  <div key={p} style={{...card,cursor:"pointer",border:period===p?"1px solid #22c55e44":"1px solid transparent"}} onClick={()=>setPeriod(p)}>
                    <span style={lbl}>{label}</span>
                    {Object.keys(d).length===0
                      ? <div style={{color:"#4a5568",fontSize:13}}>—</div>
                      : Object.entries(d).map(([cur,v]:any)=>(
                        <div key={cur} style={{color:"#ef4444",fontWeight:700,fontSize:14}}>
                          {v.total.toFixed(4)} <span style={{color:"#94a3b8",fontSize:10}}>{cur}</span>
                        </div>
                      ))
                    }
                  </div>
                );
              })}
            </div>

            {/* Fee breakdown by category */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:24}}>
              {[
                {label:"FX / Swap Fees", items:fxFees, color:"#a78bfa"},
                {label:"Cashout Fees",   items:cashoutFees, color:"#f59e0b"},
                {label:"Other Fees",     items:otherFees, color:"#60a5fa"},
              ].map(({label,items,color})=>(
                <div key={label} style={card}>
                  <span style={{...lbl,color}}>{label}</span>
                  {items.length===0
                    ? <p style={{color:"#4a5568",fontSize:13,margin:0}}>None yet</p>
                    : items.map((r:any,i:number)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{color:"#94a3b8",fontSize:12}}>{r._id.type} / {r._id.currency}</span>
                        <span style={{color,fontWeight:700,fontSize:13}}>{r.total.toFixed(6)}</span>
                      </div>
                    ))
                  }
                  {items.length>0 && (
                    <div style={{borderTop:"1px solid #1d2942",paddingTop:8,marginTop:4,display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:"#94a3b8",fontSize:11}}>Total</span>
                      <span style={{color,fontWeight:700}}>{items.reduce((s:number,r:any)=>s+r.total,0).toFixed(6)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Recent fee records */}
            <div style={card}>
              <h3 style={{margin:"0 0 16px",...lbl,fontSize:12}}>All Fee Transactions</h3>
              {!fees?.recent?.length
                ? <p style={{color:"#94a3b8",fontSize:13}}>No records yet.</p>
                : <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{color:"#94a3b8",borderBottom:"1px solid #1d2942"}}>
                        {["Date","Type","Gross","Fee%","Fee","Net","Currency","Chain","Tx Hash"].map(h=>(
                          <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fees.recent.map((f:any,i:number)=>(
                        <tr key={i} style={{borderBottom:"1px solid #0a1020",color:"white"}}>
                          <td style={{padding:"8px 10px",color:"#94a3b8",whiteSpace:"nowrap"}}>{new Date(f.createdAt).toLocaleString()}</td>
                          <td style={{padding:"8px 10px"}}>
                            <span style={{padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:600,
                              background:['flower_swap','crypto_swap'].includes(f.txType)?"#1a0a2e":f.txType==="cashout"?"#1a1200":"#0a1a2e",
                              color:['flower_swap','crypto_swap'].includes(f.txType)?"#a78bfa":f.txType==="cashout"?"#f59e0b":"#60a5fa"
                            }}>{f.txType}</span>
                          </td>
                          <td style={{padding:"8px 10px"}}>{f.grossAmount?.toFixed(6)}</td>
                          <td style={{padding:"8px 10px",color:"#94a3b8"}}>{f.feePercent}%</td>
                          <td style={{padding:"8px 10px",color:"#ef4444",fontWeight:600}}>{f.feeAmount?.toFixed(6)}</td>
                          <td style={{padding:"8px 10px",color:"#22c55e"}}>{f.netAmount?.toFixed(6)}</td>
                          <td style={{padding:"8px 10px",color:"#94a3b8"}}>{f.currency}</td>
                          <td style={{padding:"8px 10px",color:"#94a3b8"}}>{f.chain||"—"}</td>
                          <td style={{padding:"8px 10px"}}>
                            {f.txHash
                              ? <a href={`https://basescan.org/tx/${f.txHash}`} target="_blank" rel="noreferrer"
                                  style={{color:"#3b82f6",fontSize:10,fontFamily:"monospace"}}>{f.txHash.slice(0,12)}...</a>
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </>
        )}

        {tab==="wallets" && (
          <div style={card}>
            <h3 style={{margin:"0 0 16px",...lbl,fontSize:12}}>All User Wallets ({wallets.length})</h3>
            {wallets.length===0
              ? <p style={{color:"#94a3b8"}}>No wallets found.</p>
              : wallets.map((w,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #0d1526"}}>
                  <div>
                    <div style={{color:"white",fontWeight:600,fontSize:13}}>{w.iscanAddress}</div>
                    <div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>{w.chainAddresses?.map((c:any)=>c.chain).join(" · ")}</div>
                  </div>
                  <span style={{padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:600,
                    background:w.status==="active"?"#0a1f0a":"#1f0a0a",
                    color:w.status==="active"?"#22c55e":"#ef4444"}}>{w.status}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
