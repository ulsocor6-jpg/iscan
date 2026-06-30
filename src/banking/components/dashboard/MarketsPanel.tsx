import { useEffect, useState } from "react";

const COINS = [
  { symbol: "BTC",    id: "bitcoin",    decimals: 0 },
  { symbol: "ETH",    id: "ethereum",   decimals: 2 },
  { symbol: "SOL",    id: "solana",     decimals: 2 },
  { symbol: "RON",    id: "ronin",      decimals: 4 },
  { symbol: "USDC",   id: "usd-coin",   decimals: 4 },
  { symbol: "FLOWER", id: "flower-2",   decimals: 5 },
];

type CoinRow = {
  symbol: string;
  price: string;
  change: string;
  changePositive: boolean;
};

export default function MarketsPanel() {
  const [markets, setMarkets] = useState<CoinRow[]>(
    COINS.map(c => ({ symbol: c.symbol, price: "...", change: "...", changePositive: true }))
  );
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState(false);

  const fetchPrices = async () => {
    try {
      const ids = COINS.map(c => c.id).join(",");
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("CoinGecko error");
      const data = await res.json();

      setMarkets(COINS.map(c => {
        const entry = data[c.id];
        const price = entry?.usd;
        const change = entry?.usd_24h_change;
        return {
          symbol: c.symbol,
          price: price != null
            ? `$${price.toLocaleString("en-US", { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals })}`
            : "N/A",
          change: change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}%` : "N/A",
          changePositive: (change ?? 0) >= 0,
        };
      }));

      setLastUpdated(new Date().toLocaleTimeString());
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, 30_000); // refresh every 30s
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Markets</h2>
        <span style={{ fontSize: 11, color: error ? "#f87171" : "#94a3b8" }}>
          {error ? "⚠ fetch failed" : lastUpdated ? `updated ${lastUpdated}` : "loading..."}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#94a3b8", fontSize: 12 }}>
            <th style={{ textAlign: "left", padding: "4px 0" }}>Asset</th>
            <th style={{ textAlign: "right" }}>Price</th>
            <th style={{ textAlign: "right" }}>24h</th>
          </tr>
        </thead>
        <tbody>
          {markets.map(m => (
            <tr key={m.symbol}>
              <td style={{ padding: "6px 0", fontWeight: 600 }}>{m.symbol}</td>
              <td style={{ textAlign: "right" }}>{m.price}</td>
              <td style={{ textAlign: "right", color: m.changePositive ? "#4ade80" : "#f87171" }}>
                {m.change}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
