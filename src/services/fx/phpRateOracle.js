import axios from 'axios';
import { estimateGasCostUSD } from './gasEstimator.js';

const SPREAD = 0.015;
let cache = { market: null, ts: 0 };
const TTL = 60_000;

async function getMarketRate() {
  if (cache.market && Date.now() - cache.ts < TTL)
    return cache.market;

  let data;
  try {
    ({ data } = await axios.get(
      'https://open.er-api.com/v6/latest/USD'
    ));
  } catch (err) {
    console.error('[oracle] FX rate fetch failed:', err.message);
    throw new Error('FX rate provider unavailable');
  }

  if (!data?.rates?.PHP) {
    console.error('[oracle] FX rate response missing rates.PHP:', JSON.stringify(data).slice(0, 200));
    throw new Error('FX rate provider returned unexpected response');
  }

  cache = {
    market: data.rates.PHP,
    ts: Date.now()
  };

  console.log(`[oracle] Market USD/PHP = ${cache.market}`);

  return cache.market;
}

// Customer CASHES OUT (we BUY USDC) — includes the real on-chain sweep
// gas cost (user's stablecoin -> treasury) so the platform doesn't
// absorb that cost silently. `swapAmountUSD` lets the gas cost be
// expressed as a % of the swap so small swaps aren't wiped out by a
// flat fee and large swaps aren't overcharged.
export async function getUSDPHPRate(chain = null, swapAmountUSD = null) {
  const market = await getMarketRate();
  let rate = market * (1 - SPREAD);

  if (chain) {
    const gasCostUSD = await estimateGasCostUSD(chain);
    if (gasCostUSD > 0 && swapAmountUSD) {
      const gasCostPct = gasCostUSD / swapAmountUSD;
      rate = rate * (1 - gasCostPct);
      console.log(`[oracle] gas adjustment (${chain}): -$${gasCostUSD.toFixed(4)} (${(gasCostPct * 100).toFixed(3)}%)`);
    }
  }

  console.log(
    `[oracle] SELL RATE (USDC→PHP): ${market} -> ${rate}`
  );

  return rate;
}

// Customer BUYS USDC (we SELL USDC) — includes the real on-chain payout
// gas cost (treasury -> user) the same way.
export async function getPHPUSDRate(chain = null, swapAmountUSD = null) {
  const market = await getMarketRate();

  let buyRate = market * (1 + SPREAD);

  if (chain) {
    const gasCostUSD = await estimateGasCostUSD(chain);
    if (gasCostUSD > 0 && swapAmountUSD) {
      const gasCostPct = gasCostUSD / swapAmountUSD;
      buyRate = buyRate * (1 + gasCostPct);
      console.log(`[oracle] gas adjustment (${chain}): +$${gasCostUSD.toFixed(4)} (${(gasCostPct * 100).toFixed(3)}%)`);
    }
  }

  const rate = 1 / buyRate;

  console.log(
    `[oracle] BUY RATE (PHP→USDC): ${buyRate} -> ${rate}`
  );

  return rate;
}
