import { v4 as uuid } from 'uuid';
import { settleStablecoinToPHP, settlePHPToStablecoin, getPoolStatus } from '../services/swap/phpSettlementService.js';
import { getUSDPHPRate, getPHPUSDRate } from '../services/fx/phpRateOracle.js';
import FeeRecord from '../models/feeModel.js';

export async function quoteSwap(req, res) {
  try {
    const { fromCurrency, toCurrency, amount } = req.query;
    const amt = parseFloat(amount);
    const SPREAD = 0.015;

    let baseRate, rate, out, marketOut;

    if (fromCurrency === 'PHP') {
      baseRate  = await getPHPUSDRate();
      rate      = baseRate * (1 - SPREAD);
      out       = amt * rate;
      marketOut = amt * baseRate;
    } else {
      baseRate  = await getUSDPHPRate();
      rate      = baseRate;
      out       = amt * rate;
      marketOut = amt * (baseRate / (1 - SPREAD));
    }

    const slippage = Math.abs(marketOut - out);
    const symbol   = toCurrency === 'PHP' ? '₱' : '';

    res.json({
      display:       `1 ${fromCurrency} = ${symbol}${rate.toFixed(2)} ${toCurrency}`,
      youGet:        +out.toFixed(4),
      youGetLabel:   `${symbol}${out.toFixed(2)} ${toCurrency}`,
      slippage:      +slippage.toFixed(4),
      slippageLabel: `${symbol}${slippage.toFixed(2)} (1.5%)`,
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
}

export async function executeSwap(req, res) {
  try {
    const { fromCurrency, toCurrency, amount, chain = 'base' } = req.body;
    const userId = req.user.id;
    const txRef  = uuid();

    let result;
    if (fromCurrency === 'PHP') {
      result = await settlePHPToStablecoin({ userId, phpAmount: +amount, currency: toCurrency, txRef, chain });
    } else {
      result = await settleStablecoinToPHP({ userId, stablecoinAmount: +amount, currency: fromCurrency, txRef, chain });
    }
    try {
      const grossAmount = +amount;
      const feeAmount = parseFloat((grossAmount * 0.015).toFixed(6));
      await FeeRecord.create({
        referenceId: 'FEE-' + txRef,
        userId,
        txType: 'crypto_swap',
        currency: fromCurrency === 'PHP' ? toCurrency : 'PHP',
        grossAmount,
        feePercent: 1.5,
        feeAmount,
        netAmount: grossAmount - feeAmount,
        metadata: { fromCurrency, toCurrency, txRef }
      });
    } catch (feeErr) {
      console.error('[phpSwap] FeeRecord failed (non-fatal):', feeErr.message);
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
