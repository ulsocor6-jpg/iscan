// src/pages/Treasury.tsx — full replacement (pools + existing fees + wallets)
import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";

const card = { background:"#0d1526", borderRadius:12, padding:20 } as const;
const lbl  = { color:"#94a3b8", fontSize:11, textTransform:"uppercase" as const, letterSpacing:1, marginBottom:6, display:"block" as const };
type Period = "day"|"week"|"month"|"year"|"all";

// ── Pool health ───────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string,string> = {
  HEALTHY:"#22c55e", WARNING:"#f59e0b", CRITICAL:"#ef4444", DEADLOCK:"#7f1d1d",
};
const STATUS_BG: Record<string,string> = {
  HEALTHY:"rgba(34,197,94,0.08)", WARNING:"rgba(245,158,11,0.08)",
  CRITICAL:"rgba(239,68,68,0.08)", DEADLOCK:"rgba(127,29,29,0.25)",
};
const STATUS_ICON: Record<string,string> = {
  HEALTHY:"✅", WARNING:"🟡", CRITICAL:"🔴", DEADLOCK:"⛔",
};
const CURRENCY_COLOR: Record<string,string> = {
  PHP:"#3b82f6", USDT:"#26a17b", USDC:"#2775ca",
};

function sumByCurrency(arr: any[]) {
  const m: Record<string,{total:number,count:number}> = {};
  arr.forEach(r => {
    const k = r._id;
    if (!m[k]) m[k] = { total:0, count:0 };
    m[k].total += r.total;
    m[k].count += r.count;
  });
  return m;
}

// ── Pool card ─────────────────────────────────────────────────────────────────
function PoolCard({ pool, onTopup }: { pool: any; onTopup: (currency: string, amount: number) => void }) {
  const [topupAmount, setTopupAmount] = useState("");
  const [topping,     setTopping]     = useState(false);
  const color = STATUS_COLOR[pool.status] ?? "#94a3b8";
  const bg    = STATUS_BG[pool.status]    ?? "transparent";
  const pct   = pool.ratio ?? 0;

  async function handleTopup() {
    const amt = parseFloat(topupAmount);
    if (!amt || amt <= 0) return;
    setTopping(true);
    await onTopup(pool.currency, amt);
    setTopupAmount("");
    setTopping(false);
  }

  return (
    <div style={{ background:"#0d1526", border:`1px solid ${color}40`, borderRadius:14, padding:24 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:10, height:10, borderRadius:"50%",
            background: CURRENCY_COLOR[pool.currency] ?? "#94a3b8" }} />
          <span style={{ fontSize:18, fontWeight:700, color:"white" }}>{pool.currency}</span>
          <span style={{ fontSize:11, color:"#64748b" }}>Liquidity Pool</span>
        </div>
        <div style={{ padding:"4px 12px", borderRadius:99, fontSize:12, fontWeight:700,
          color, background:bg, border:`1px solid ${color}40` }}>
          {STATUS_ICON[pool.status]} {pool.status}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
        {[
          { label:"Total Balance", value: pool.balance?.toFixed(2),   color:"white"   },
          { label:"Reserved",      value: pool.reserved?.toFixed(2),  color:"#f59e0b" },
          { label:"Available",     value: pool.available?.toFixed(2), color:"#22c55e" },
        ].map(({ label, value, color: c }) => (
          <div key={label} style={{ background:"#121b2f", borderRadius:10, padding:"10px 12px" }}>
            <div style={{ fontSize:10, color:"#64748b", marginBottom:3,
              textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>{label}</div>
            <div style={{ fontSize:16, fontWeight:700, color:c, fontFamily:"monospace" }}>{value ?? "—"}</div>
          </div>
        ))}
      </div>

      {/* On-chain balance (live) — only for USDC/USDT, PHP has no chain equivalent */}
      {pool.onChainBalance !== null && pool.onChainBalance !== undefined && (
        <div style={{ background:"#121b2f", borderRadius:10, padding:"10px 12px", marginBottom:14,
          display:"flex", justifyContent:"space-between", alignItems:"center",
          border: Math.abs(pool.onChainDiff ?? 0) > 0.01 ? "1px solid #f59e0b60" : "1px solid transparent" }}>
          <div>
            <div style={{ fontSize:10, color:"#64748b", textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>
              On-Chain Balance (live)
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:"#60a5fa", fontFamily:"monospace" }}>
              {pool.onChainBalance?.toFixed(6)}
            </div>
          </div>
          {Math.abs(pool.onChainDiff ?? 0) > 0.01 && (
            <div style={{ fontSize:11, color:"#f59e0b", fontWeight:700 }}>
              ⚠️ Δ {pool.onChainDiff > 0 ? "+" : ""}{pool.onChainDiff.toFixed(6)}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
          <span style={{ fontSize:11, color:"#64748b" }}>Available</span>
          <span style={{ fontSize:11, color, fontWeight:700 }}>{pct}%</span>
        </div>
        <div style={{ background:"#1d2942", borderRadius:99, height:7, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:99, width:`${Math.min(pct,100)}%`,
            background:color, transition:"width 0.5s ease" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
          <span style={{ fontSize:10, color:"#475569" }}>Min: {pool.minThreshold?.toFixed(2)}</span>
          <span style={{ fontSize:10, color:"#475569" }}>Usable: <strong style={{ color:"#94a3b8" }}>{pool.usable?.toFixed(2)}</strong></span>
        </div>
      </div>

      {/* Warning */}
      {(pool.status === "DEADLOCK" || pool.status === "CRITICAL") && (
        <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid #dc2626",
          borderRadius:8, padding:"9px 12px", marginBottom:12, fontSize:12, color:"#ef4444" }}>
          ⚠️ {pool.status === "DEADLOCK"
            ? "Deadlocked — inject funds immediately to resume swaps."
            : `Critically low (${pct}%). Top up soon.`}
        </div>
      )}

      {/* Top-up */}
      <div style={{ borderTop:"1px solid #1d2942", paddingTop:12 }}>
        <div style={{ fontSize:10, color:"#64748b", marginBottom:7,
          textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>Manual Top-Up</div>
        <div style={{ display:"flex", gap:8 }}>
          <input type="number" placeholder={`Amount (${pool.currency})`}
            value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
            style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1px solid #1d2942",
              background:"#121b2f", color:"white", fontSize:13 }} />
          <button onClick={handleTopup} disabled={topping || !topupAmount}
            style={{ padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer",
              background:"#16a34a", color:"white", fontWeight:700, fontSize:13,
              opacity: topping || !topupAmount ? 0.6 : 1 }}>
            {topping ? "…" : "+ Top Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Treasury() {
  const [fees,    setFees]    = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [pools,   setPools]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState<Period>("week");
  const [tab,     setTab]     = useState<"pools"|"fees"|"wallets">("pools");
  const [msg,     setMsg]     = useState<{ text:string; type:string } | null>(null);

  const load = useCallback(async () => {
    const [f, w, p] = await Promise.all([
      fetch("/api/v1/treasury/fees",    { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/wallets", { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/pools",   { credentials:"include" }).then(r => r.json()),
    ]);
    setFees(f);
    setWallets(w.wallets || []);
    setPools(p.pools || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  function flash(text: string, type = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleTopup(currency: string, amount: number) {
    const res = await fetch(`/api/v1/treasury/pools/${currency}/topup`, {
      method:"POST", credentials:"include",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ amount }),
    }).then(r => r.json());
    if (res.success) { flash(`✅ ${currency} pool topped up by ${amount}`); load(); }
    else flash("❌ " + (res.error ?? "Top-up failed"), "error");
  }

  const periodData = fees ? {
    day:   sumByCurrency(fees.day   || []),
    week:  sumByCurrency(fees.week  || []),
    month: sumByCurrency(fees.month || []),
    year:  sumByCurrency(fees.year  || []),
    all:   sumByCurrency(fees.all   || []),
  } : null;

  const current = periodData?.[period] || {};
  const byType  = fees?.byType || [];
  const fxFees      = byType.filter((r:any) => ['crypto_swap','flower_swap'].includes(r._id.type));
  const cashoutFees = byType.filter((r:any) => r._id.type === 'cashout');
  const otherFees   = byType.filter((r:any) => !['crypto_swap','flower_swap','cashout'].includes(r._id.type));

  const tabBtn = (t: string) => ({
    padding:"8px 20px", borderRadius:8, border:"none", cursor:"pointer",
    fontWeight:600, fontSize:13, marginRight:8,
    background: tab === t ? "#3b82f6" : "#1d2942", color:"white",
  } as const);

  const pBtn = (p: Period) => ({
    padding:"6px 14px", borderRadius:6, cursor:"pointer", fontWeight:600,
    fontSize:12, marginRight:6,
    border:   period === p ? "1px solid #22c55e44" : "1px solid transparent",
    background: period === p ? "#22c55e22" : "#1d2942",
    color:      period === p ? "#22c55e"   : "#94a3b8",
  } as const);

  const overallStatus = pools.some(p => p.status === "DEADLOCK") ? "DEADLOCK"
    : pools.some(p => p.status === "CRITICAL") ? "CRITICAL"
    : pools.some(p => p.status === "WARNING")  ? "WARNING"
    : pools.length > 0 ? "HEALTHY" : null;

  if (loading) return (
    <DashboardLayout>
      <div className="dashboard" style={{ color:"#94a3b8" }}>Loading treasury...</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="dashboard">

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ margin:0 }}>Treasury</h2>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {overallStatus && (
              <div style={{ padding:"5px 14px", borderRadius:99, fontSize:12, fontWeight:700,
                color: STATUS_COLOR[overallStatus],
                background: STATUS_BG[overallStatus],
                border:`1px solid ${STATUS_COLOR[overallStatus]}40` }}>
                {STATUS_ICON[overallStatus]} System {overallStatus}
              </div>
            )}
            <button onClick={load} style={{ padding:"7px 14px", borderRadius:8,
              border:"1px solid #1d2942", background:"#121b2f",
              color:"#94a3b8", cursor:"pointer", fontSize:12 }}>
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Flash */}
        {msg && (
          <div style={{ padding:"11px 16px", borderRadius:8, marginBottom:16, fontSize:13,
            background: msg.type === "error" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
            color:      msg.type === "error" ? "#ef4444"              : "#22c55e",
            border:`1px solid ${msg.type === "error" ? "#dc2626" : "#16a34a"}` }}>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div style={{ marginBottom:20 }}>
          <button style={tabBtn("pools")}   onClick={() => setTab("pools")}>🏦 Liquidity Pools</button>
          <button style={tabBtn("fees")}    onClick={() => setTab("fees")}>💰 Fee Analytics</button>
          <button style={tabBtn("wallets")} onClick={() => setTab("wallets")}>👛 Wallets</button>
        </div>

        {/* ── POOLS TAB ── */}
        {tab === "pools" && (
          pools.length === 0 ? (
            <div style={{ ...card, textAlign:"center", padding:48, color:"#475569" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🏦</div>
              <div style={{ fontSize:15, marginBottom:8 }}>No liquidity pools found</div>
              <div style={{ fontSize:13 }}>
                Run <code style={{ color:"#60a5fa" }}>node scripts/seedUSDTPool.js</code> to seed initial pools
              </div>
            </div>
          ) : (
            <div style={{ display:"grid",
              gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:16 }}>
              {pools.map(pool => (
                <PoolCard key={pool.currency} pool={pool} onTopup={handleTopup} />
              ))}
            </div>
          )
        )}

        {/* ── FEES TAB ── */}
        {tab === "fees" && (
          <>
            {/* Period selector */}
            <div style={{ marginBottom:20 }}>
              {(["day","week","month","year","all"] as Period[]).map(p => (
                <button key={p} style={pBtn(p)} onClick={() => setPeriod(p)}>
                  {p==="day"?"24h":p==="week"?"7 Days":p==="month"?"30 Days":p==="year"?"365 Days":"All Time"}
                </button>
              ))}
            </div>

            {/* Summary cards */}
            <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
              {Object.keys(current).length === 0
                ? <div style={{ ...card, color:"#94a3b8", fontSize:13 }}>No fees in this period.</div>
                : Object.entries(current).map(([cur, data]: any) => (
                  <div key={cur} style={{ ...card, minWidth:160 }}>
                    <span style={lbl}>{cur} Collected</span>
                    <div style={{ color:"#ef4444", fontSize:24, fontWeight:700, marginBottom:4 }}>
                      {data.total.toFixed(6)}
                    </div>
                    <div style={{ color:"#94a3b8", fontSize:12 }}>{data.count} transactions</div>
                  </div>
                ))
              }
            </div>

            {/* All-time comparison row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:24 }}>
              {(["day","week","month","year","all"] as Period[]).map(p => {
                const d = periodData?.[p] || {};
                const label = p==="day"?"24h":p==="week"?"7d":p==="month"?"30d":p==="year"?"365d":"All";
                return (
                  <div key={p} style={{ ...card, cursor:"pointer",
                    border: period===p ? "1px solid #22c55e44" : "1px solid transparent" }}
                    onClick={() => setPeriod(p)}>
                    <span style={lbl}>{label}</span>
                    {Object.keys(d).length === 0
                      ? <div style={{ color:"#4a5568", fontSize:13 }}>—</div>
                      : Object.entries(d).map(([cur, v]: any) => (
                        <div key={cur} style={{ color:"#ef4444", fontWeight:700, fontSize:14 }}>
                          {v.total.toFixed(4)} <span style={{ color:"#94a3b8", fontSize:10 }}>{cur}</span>
                        </div>
                      ))
                    }
                  </div>
                );
              })}
            </div>

            {/* Fee breakdown by category */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:24 }}>
              {[
                { label:"FX / Swap Fees", items:fxFees,      color:"#a78bfa" },
                { label:"Cashout Fees",   items:cashoutFees,  color:"#f59e0b" },
                { label:"Other Fees",     items:otherFees,    color:"#60a5fa" },
              ].map(({ label, items, color }) => (
                <div key={label} style={card}>
                  <span style={{ ...lbl, color }}>{label}</span>
                  {items.length === 0
                    ? <p style={{ color:"#4a5568", fontSize:13, margin:0 }}>None yet</p>
                    : items.map((r: any, i: number) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                        <span style={{ color:"#94a3b8", fontSize:12 }}>{r._id.type} / {r._id.currency}</span>
                        <span style={{ color, fontWeight:700, fontSize:13 }}>{r.total.toFixed(6)}</span>
                      </div>
                    ))
                  }
                  {items.length > 0 && (
                    <div style={{ borderTop:"1px solid #1d2942", paddingTop:8, marginTop:4,
                      display:"flex", justifyContent:"space-between" }}>
                      <span style={{ color:"#94a3b8", fontSize:11 }}>Total</span>
                      <span style={{ color, fontWeight:700 }}>
                        {items.reduce((s: number, r: any) => s + r.total, 0).toFixed(6)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Recent fee records table */}
            <div style={card}>
              <h3 style={{ margin:"0 0 16px", ...lbl, fontSize:12 }}>All Fee Transactions</h3>
              {!fees?.recent?.length
                ? <p style={{ color:"#94a3b8", fontSize:13 }}>No records yet.</p>
                : <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ color:"#94a3b8", borderBottom:"1px solid #1d2942" }}>
                        {["Date","Type","Gross","Fee%","Fee","Net","Currency","Chain","Tx Hash"].map(h => (
                          <th key={h} style={{ padding:"8px 10px", textAlign:"left",
                            fontWeight:600, whiteSpace:"nowrap" as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fees.recent.map((f: any, i: number) => (
                        <tr key={i} style={{ borderBottom:"1px solid #0a1020", color:"white" }}>
                          <td style={{ padding:"8px 10px", color:"#94a3b8", whiteSpace:"nowrap" as const }}>
                            {new Date(f.createdAt).toLocaleString()}
                          </td>
                          <td style={{ padding:"8px 10px" }}>
                            <span style={{ padding:"2px 6px", borderRadius:4, fontSize:10, fontWeight:600,
                              background: ['flower_swap','crypto_swap'].includes(f.txType) ? "#1a0a2e"
                                : f.txType==="cashout" ? "#1a1200" : "#0a1a2e",
                              color: ['flower_swap','crypto_swap'].includes(f.txType) ? "#a78bfa"
                                : f.txType==="cashout" ? "#f59e0b" : "#60a5fa",
                            }}>{f.txType}</span>
                          </td>
                          <td style={{ padding:"8px 10px" }}>{f.grossAmount?.toFixed(6)}</td>
                          <td style={{ padding:"8px 10px", color:"#94a3b8" }}>{f.feePercent}%</td>
                          <td style={{ padding:"8px 10px", color:"#ef4444", fontWeight:600 }}>
                            {f.feeAmount?.toFixed(6)}
                          </td>
                          <td style={{ padding:"8px 10px", color:"#22c55e" }}>{f.netAmount?.toFixed(6)}</td>
                          <td style={{ padding:"8px 10px", color:"#94a3b8" }}>{f.currency}</td>
                          <td style={{ padding:"8px 10px", color:"#94a3b8" }}>{f.chain || "—"}</td>
                          <td style={{ padding:"8px 10px" }}>
                            {f.txHash
                              ? <a href={`https://basescan.org/tx/${f.txHash}`} target="_blank"
                                  rel="noreferrer" style={{ color:"#3b82f6", fontSize:10, fontFamily:"monospace" }}>
                                  {f.txHash.slice(0,12)}...
                                </a>
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

        {/* ── WALLETS TAB ── */}
        {tab === "wallets" && (
          <div style={card}>
            <h3 style={{ margin:"0 0 16px", ...lbl, fontSize:12 }}>
              All User Wallets ({wallets.length})
            </h3>
            {wallets.length === 0
              ? <p style={{ color:"#94a3b8" }}>No wallets found.</p>
              : wallets.map((w, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", padding:"12px 0", borderBottom:"1px solid #0d1526" }}>
                  <div>
                    <div style={{ color:"white", fontWeight:600, fontSize:13 }}>{w.iscanAddress}</div>
                    <div style={{ color:"#94a3b8", fontSize:11, marginTop:2 }}>
                      {w.chainAddresses?.map((c: any) => c.chain).join(" · ")}
                    </div>
                  </div>
                  <span style={{ padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                    background: w.status==="active" ? "#0a1f0a" : "#1f0a0a",
                    color:      w.status==="active" ? "#22c55e" : "#ef4444" }}>
                    {w.status}
                  </span>
                </div>
              ))
            }
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
