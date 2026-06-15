import { v4 as uuid } from 'uuid';
import { settleStablecoinToPHP, settlePHPToStablecoin, getPoolStatus } from '../services/swap/phpSettlementService.js';
import { getUSDPHPRate, getPHPUSDRate } from '../services/fx/phpRateOracle.js';

export async function quoteSwap(req, res) {
  try {
    const { fromCurrency, toCurrency, amount } = req.query;
    let rate, out;
    if (fromCurrency === 'PHP') {
      rate = await getPHPUSDRate();
      out  = amount * rate;
    } else {
      rate = await getUSDPHPRate();
      out  = amount * rate;
    }
    res.json({ from: fromCurrency, to: toCurrency, amount: +amount, rate, out: +out.toFixed(6) });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
}

export async function executeSwap(req, res) {
  try {
    const { fromCurrency, toCurrency, amount } = req.body;
    const userId = req.user._id;
    const txRef  = uuid();

    let result;
    if (fromCurrency === 'PHP') {
      result = await settlePHPToStablecoin({ userId, phpAmount: +amount, currency: toCurrency, txRef });
    } else {
      result = await settleStablecoinToPHP({ userId, stablecoinAmount: +amount, currency: fromCurrency, txRef });
    }
    res.json({ success: true, txRef, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function poolStatus(req, res) {
  try {
    res.json(await getPoolStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
