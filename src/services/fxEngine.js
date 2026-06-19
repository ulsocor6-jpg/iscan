/**
 * fxEngine.js  (UPDATED)
 * ─────────────────────────────────────────────────────────────
 * Converts any supported token to PHP.
 * Supports: USDT, USDC, FLOWER (+ future tokens)
 *
 * Rate sources:
 *  - USDT/USDC → phpRateOracle (USD/PHP with spread)
 *  - FLOWER    → CoinGecko (via rateProvider)
 */

import { getUSDPHPRate } from './fx/phpRateOracle.js';
import { getRate }       from './fx/rateProvider.js';

// Map asset → how to get PHP rate
const RATE_STRATEGY = {
  USDT: 'usd_oracle',
  USDC: 'usd_oracle',
  FLOWER: 'coingecko',
  PHP:  'passthrough',
};

export async function convertToPHP(amount, asset) {
  const strategy = RATE_STRATEGY[asset];

  if (!strategy) {
    throw new Error(`Unsupported asset: ${asset}. Add it to fxEngine.js RATE_STRATEGY`);
  }

  if (strategy === 'passthrough') {
    return { phpAmount: amount, rate: 1, source: 'passthrough' };
  }

  if (strategy === 'usd_oracle') {
    const rate      = await getUSDPHPRate();   // already has 1.5% spread baked in
    const phpAmount = parseFloat((amount * rate).toFixed(2));
    return { phpAmount, rate, source: 'oracle' };
  }

  if (strategy === 'coingecko') {
    const usdRate   = await getRate(asset);    // USD price of token
    if (!usdRate) throw new Error(`CoinGecko rate unavailable for ${asset}`);
    const phpOracle = await getUSDPHPRate();
    const rate      = usdRate * phpOracle;
    const phpAmount = parseFloat((amount * rate).toFixed(2));
    return { phpAmount, rate, source: 'coingecko' };
  }
}

/**
 * Get display rate for UI quotes
 * Returns: { rate, display, source }
 */
export async function getDisplayRate(asset, targetCurrency = 'PHP') {
  const { rate, source } = await convertToPHP(1, asset);
  return {
    rate,
    display: `1 ${asset} = ₱${rate.toFixed(2)} PHP`,
    source,
  };
}
