import axios from "axios";

const COINS = {
  USDC: "usd-coin",
  USDT: "tether",
  ETH: "ethereum",
  MATIC: "matic-network",
  FLOWER: "flower-2",
  RON: "ronin"
};

// fallback-safe multi source
export async function getRate(currency) {
  const id = COINS[currency.toUpperCase()];
  if (!id) throw new Error("Unsupported currency");

  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=php`
    );

    return res.data[id]?.php || null;
  } catch (err) {
    console.log("[FX] Primary source failed");
    return null;
  }
}
// Simple 15s cache to prevent CoinGecko rate limiting
const _cache = {};
const _RATE_TTL = 15_000;
export async function getRateCached(currency) {
  const now = Date.now();
  if (_cache[currency] && now - _cache[currency].ts < _RATE_TTL)
    return _cache[currency].rate;
  const rate = await getRate(currency);
  _cache[currency] = { rate, ts: now };
  return rate;
}
