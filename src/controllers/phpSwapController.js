import { v4 as uuid } from 'uuid';
import { settleStablecoinToPHP, settlePHPToStablecoin, getPoolStatus } from '../services/swap/phpSettlementService.js';
import { getRates } from '../services/fx/phpRateOracle.js';

export async function quoteSwap(req, res) {
  try {
    const { fromCurrency, toCurrency, amount } = req.query;
    const amt = parseFloat(amount);
    const { baseRate, rate } = await getRates();

    let out, marketOut;

    if (fromCurrency === 'PHP') {
      out       = amt * (1 / rate);
      marketOut = amt * (1 / baseRate);
    } else {
      out       = amt * rate;
      marketOut = amt * baseRate;
    }

    const slippage = Math.abs(marketOut - out);

    res.json({
      display:     `1 ${fromCurrency} = ${toCurrency === 'PHP' ? '₱' : ''}${rate.toFixed(2)}`,
      youGet:      +out.toFixed(4),
      youGetLabel: `${toCurrency === 'PHP' ? '₱' : ''}${out.toFixed(2)} ${toCurrency}`,
      slippage:    +slippage.toFixed(4),
      slippageLabel: `${toCurrency === 'PHP' ? '₱' : ''}${slippage.toFixed(2)} (1.5%)`,
    });
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
