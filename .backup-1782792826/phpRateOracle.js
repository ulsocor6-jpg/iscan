import axios from 'axios';

const SPREAD = 0.015;
let cache = { market: null, ts: 0 };
const TTL = 10_000;

async function getMarketRate() {
  if (cache.market && Date.now() - cache.ts < TTL)
    return cache.market;

  const { data } = await axios.get(
    'https://api.exchangerate-api.com/v4/latest/USD'
  );

  cache = {
    market: data.rates.PHP,
    ts: Date.now()
  };

  console.log(`[oracle] Market USD/PHP = ${cache.market}`);

  return cache.market;
}

// Customer CASHES OUT (we BUY USDC)
export async function getUSDPHPRate() {
  const market = await getMarketRate();
  const rate = market * (1 - SPREAD);

  console.log(
    `[oracle] SELL RATE (USDC→PHP): ${market} -> ${rate}`
  );

  return rate;
}

// Customer BUYS USDC (we SELL USDC)
export async function getPHPUSDRate() {
  const market = await getMarketRate();

  const buyRate = market * (1 + SPREAD);

  const rate = 1 / buyRate;

  console.log(
    `[oracle] BUY RATE (PHP→USDC): ${buyRate} -> ${rate}`
  );

  return rate;
}
