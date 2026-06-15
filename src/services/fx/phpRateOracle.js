import axios from 'axios';

const SPREAD = 0.015; // 1.5% your margin
let cache = { rate: null, ts: 0 };
const TTL = 60_000; // refresh every 60s

export async function getUSDPHPRate() {
  if (cache.rate && Date.now() - cache.ts < TTL) return cache.rate;
  try {
    const { data } = await axios.get(
      'https://api.exchangerate-api.com/v4/latest/USD'
    );
    const base = data.rates.PHP;
    cache = { rate: base * (1 - SPREAD), ts: Date.now() };
    console.log(`[oracle] USD/PHP = ${base} → with spread ${cache.rate}`);
    return cache.rate;
  } catch (err) {
    console.error('[oracle] rate fetch failed:', err.message);
    if (cache.rate) return cache.rate; // serve stale on error
    throw new Error('FX rate unavailable');
  }
}

export async function getPHPUSDRate() {
  const usdphp = await getUSDPHPRate();
  return 1 / usdphp;
}
