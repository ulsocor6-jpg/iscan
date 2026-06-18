import { useState, useEffect, useRef } from "react";

const MAX_POINTS = 20;
const COINGECKO_ID = "flower-price"; // CoinGecko coin id for FLOWER

export default function FlowerTicker() {
  const [points, setPoints] = useState<number[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number>(0);
  const [error, setError] = useState(false);
  const intervalRef = useRef<any>(null);

  async function fetchRate() {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_ID}&vs_currencies=usd&include_24hr_change=true`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      const price = data?.[COINGECKO_ID]?.usd;
      const change = data?.[COINGECKO_ID]?.usd_24h_change ?? 0;
      if (!price || isNaN(price)) return;
      setError(false);
      setCurrent(price);
      setChange24h(change);
      setPoints(prev => [...prev, price].slice(-MAX_POINTS));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    fetchRate();
    intervalRef.current = setInterval(fetchRate, 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  function renderSparkline() {
    if (points.length < 2) return null;
    const W = 100, H = 36, PAD = 3;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 0.0001;
    const pts = points.map((v, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x},${y}`;
    });
    const color = change24h >= 0 ? "#22c55e" : "#ef4444";
    const fillPts = [`${PAD},${H}`, ...pts, `${W - PAD},${H}`].join(" ");
    return (
      <svg width={W} height={H} style={{ display: "block" }}>
        <defs>
          <linearGradient id="fg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill="url(#fg2)" />
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle
          cx={PAD + ((points.length - 1) / (points.length - 1)) * (W - PAD * 2)}
          cy={H - PAD - ((points[points.length - 1] - min) / range) * (H - PAD * 2)}
          r="3" fill={color}
        />
      </svg>
    );
  }

  const isUp = change24h >= 0;
  const color = isUp ? "#22c55e" : "#ef4444";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: "#0d1526", border: "1px solid #1d2942",
      borderRadius: 12, padding: "8px 16px",
      minWidth: 260,
    }}>
      {/* Label + Price */}
      <div>
        <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>🌸 FLOWER / USD</div>
        <div style={{ color: "white", fontSize: 18, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>
          {current !== null
            ? `$${current.toFixed(5)}`
            : error ? "—" : "…"}
        </div>
      </div>

      {/* Sparkline */}
      <div>{renderSparkline()}</div>

      {/* 24h change badge */}
      <div style={{
        color, fontSize: 13, fontWeight: 700,
        background: isUp ? "#052e16" : "#2d0a0a",
        border: `1px solid ${isUp ? "#16a34a40" : "#dc262640"}`,
        padding: "4px 10px", borderRadius: 8,
        whiteSpace: "nowrap" as const,
      }}>
        {isUp ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%
        <div style={{ color: "#64748b", fontSize: 9, fontWeight: 400, textAlign: "center" as const }}>24h</div>
      </div>
    </div>
  );
}
