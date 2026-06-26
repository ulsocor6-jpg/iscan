// src/banking/components/dashboard/FlowerTicker.tsx — full replacement
// Fetches live FLOWER price from Katana DEX via your own quote endpoint
// instead of CoinGecko — so it always matches the swap conversion rate.
import { useState, useEffect, useRef } from "react";

const MAX_POINTS = 20;

export default function FlowerTicker() {
  const [points,    setPoints]    = useState<number[]>([]);
  const [current,   setCurrent]   = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number>(0);
  const [error,     setError]     = useState(false);
  const intervalRef = useRef<any>(null);
  const openRef     = useRef<number | null>(null); // price 24 h ago approximation

  async function fetchRate() {
    try {
      // 1 FLOWER → USDC via Katana — same source as Swaps page
      const res = await fetch(
        "/api/v1/flower/usdt/quote?fromCurrency=FLOWER&toCurrency=USDC&amount=1",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("quote failed");
      const data = await res.json();

      // The quote returns { rate, amountOut, ... } — amountOut for 1 FLOWER = price
      const price: number =
        data.rate ?? data.amountOut ?? data.price ?? data.outputAmount ?? null;

      if (!price || isNaN(price)) throw new Error("no price in response");

      setError(false);
      setCurrent(price);

      // Approximate 24h change from first recorded point
      setPoints(prev => {
        const next = [...prev, price].slice(-MAX_POINTS);
        if (openRef.current === null) openRef.current = price;
        const open = openRef.current;
        setChange24h(open > 0 ? ((price - open) / open) * 100 : 0);
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

  function renderSparkline() {
    if (points.length < 2) return null;
    const W = 100, H = 36, PAD = 3;
    const min   = Math.min(...points);
    const max   = Math.max(...points);
    const range = max - min || 0.0001;
    const pts   = points.map((v, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x},${y}`;
    });
    const color   = change24h >= 0 ? "#22c55e" : "#ef4444";
    const fillPts = [`${PAD},${H}`, ...pts, `${W - PAD},${H}`].join(" ");
    return (
      <svg width={W} height={H} style={{ display: "block" }}>
        <defs>
          <linearGradient id="fg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0"    />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill="url(#fg2)" />
        <polyline points={pts.join(" ")} fill="none" stroke={color}
          strokeWidth="2" strokeLinejoin="round" />
        <circle
          cx={PAD + ((points.length - 1) / (points.length - 1)) * (W - PAD * 2)}
          cy={H - PAD - ((points[points.length - 1] - min) / range) * (H - PAD * 2)}
          r="3" fill={color}
        />
      </svg>
    );
  }

  const isUp  = change24h >= 0;
  const color = isUp ? "#22c55e" : "#ef4444";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: "#0d1526", border: "1px solid #1d2942",
      borderRadius: 12, padding: "8px 16px", minWidth: 260,
    }}>
      <div>
        <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>🌸 FLOWER / USD</div>
        <div style={{ color: "white", fontSize: 18, fontWeight: 700,
          fontFamily: "monospace", lineHeight: 1 }}>
          {current !== null ? `$${current.toFixed(5)}` : error ? "—" : "…"}
        </div>
      </div>
      <div>{renderSparkline()}</div>
      <div style={{
        color, fontSize: 13, fontWeight: 700,
        background: isUp ? "#052e16" : "#2d0a0a",
        border: `1px solid ${isUp ? "#16a34a40" : "#dc262640"}`,
        padding: "4px 10px", borderRadius: 8, whiteSpace: "nowrap" as const,
      }}>
        {isUp ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%
        <div style={{ color: "#64748b", fontSize: 9, fontWeight: 400,
          textAlign: "center" as const }}>session</div>
      </div>
    </div>
  );
}
