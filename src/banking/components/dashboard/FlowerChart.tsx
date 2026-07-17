import { useState, useEffect, useRef } from "react";

const MAX_POINTS = 20;

export default function FlowerChart() {
  const [points, setPoints]   = useState<number[]>([]);
  const [current, setCurrent] = useState<number|null>(null);
  const [change, setChange]   = useState<number>(0);
  const [error, setError]     = useState(false);
  const intervalRef = useRef<any>(null);

  async function fetchRate() {
    try {
      const res  = await fetch("/api/v1/flower/usdt/quote?fromCurrency=FLOWER&toCurrency=USDC&amount=1", {
        credentials: "include",
      });
      const data = await res.json();
      // youGet from quote of 1 FLOWER = current rate
      const rate = parseFloat(data.youGet ?? data.youGetLabel ?? 0);
      if (!rate || isNaN(rate)) return;
      setError(false);
      setCurrent(rate);
      setPoints(prev => {
        const next = [...prev, rate].slice(-MAX_POINTS);
        if (next.length >= 2) {
          setChange(((next[next.length-1] - next[0]) / next[0]) * 100);
        }
        return next;
      });
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    fetchRate();
    intervalRef.current = setInterval(fetchRate, 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // SVG sparkline
  function renderSparkline() {
    if (points.length < 2) return null;
    const W = 300, H = 60, PAD = 4;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 0.0001;
    const pts = points.map((v, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x},${y}`;
    });
    const color = change >= 0 ? "#22c55e" : "#ef4444";
    const fillPts = [`${PAD},${H}`, ...pts, `${W - PAD},${H}`].join(" ");
    return (
      <svg width={W} height={H} style={{display:"block"}}>
        <defs>
          <linearGradient id="flowerGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill="url(#flowerGrad)"/>
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
        {/* current dot */}
        <circle
          cx={PAD + ((points.length-1) / (points.length-1)) * (W - PAD*2)}
          cy={H - PAD - ((points[points.length-1] - min) / range) * (H - PAD*2)}
          r="3" fill={color}
        />
      </svg>
    );
  }

  const isUp = change >= 0;
  const color = isUp ? "#22c55e" : "#ef4444";

  return (
    <div style={{
      background:"#0d1526", borderRadius:12, padding:"14px 18px",
      marginTop:16, maxWidth:360,
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8}}>
        <div>
          <div style={{color:"#94a3b8", fontSize:11, marginBottom:2}}>🌸 FLOWER / USDT</div>
          <div style={{color:"white", fontSize:22, fontWeight:700, fontFamily:"monospace"}}>
            {current !== null ? `$${current.toFixed(5)}` : "—"}
          </div>
        </div>
        <div style={{textAlign:"right" as const}}>
          <div style={{
            color, fontSize:13, fontWeight:600,
            background: isUp ? "#0a1f0a" : "#1f0a0a",
            padding:"3px 8px", borderRadius:6,
          }}>
            {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </div>
          <div style={{color:"#4a5568", fontSize:10, marginTop:4}}>last {points.length} ticks</div>
        </div>
      </div>

      {points.length < 2
        ? <div style={{color:"#4a5568", fontSize:12, height:60, display:"flex", alignItems:"center"}}>
            {error ? "⚠ Rate unavailable" : "Collecting data..."}
          </div>
        : renderSparkline()
      }

      <div style={{display:"flex", justifyContent:"space-between", marginTop:6}}>
        <span style={{color:"#4a5568", fontSize:10}}>
          L: ${Math.min(...points).toFixed(5)}
        </span>
        <span style={{color:"#4a5568", fontSize:10}}>30s interval</span>
        <span style={{color:"#4a5568", fontSize:10}}>
          H: ${Math.max(...points).toFixed(5)}
        </span>
      </div>
    </div>
  );
}
