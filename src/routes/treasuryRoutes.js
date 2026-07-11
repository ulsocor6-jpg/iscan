// src/routes/treasuryRoutes.js — full replacement
import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import FeeRecord from '../models/feeModel.js';
import Wallet from '../models/walletModel.js';
import PhpLiquidityPool from '../models/phpLiquidityPool.js';
import { getPoolHealth } from '../services/treasury/treasuryBalancer.js';
import { getAllBalancesForAddress } from '../services/onchainBalanceService.js';

const router = express.Router();

// ── GET /treasury/fees ─────────────────────────────────────────────────────
router.get('/fees', requireAuth, async (req, res) => {
  try {
    const now    = new Date();
    const day1   = new Date(now - 1   * 24 * 60 * 60 * 1000);
    const day7   = new Date(now - 7   * 24 * 60 * 60 * 1000);
    const day30  = new Date(now - 30  * 24 * 60 * 60 * 1000);
    const day365 = new Date(now - 365 * 24 * 60 * 60 * 1000);

    const [all, year, month, week, day, recent, byType] = await Promise.all([
      FeeRecord.aggregate([{ $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day365 } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day30  } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day7   } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day1   } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.find().sort({ createdAt: -1 }).limit(50),
      FeeRecord.aggregate([{ $group: { _id: { type: '$txType', currency: '$currency' }, total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
    ]);

    res.json({ all, year, month, week, day, recent, byType });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /treasury/wallets ──────────────────────────────────────────────────
router.get('/wallets', requireAuth, async (req, res) => {
  try {
    const wallets = await Wallet.find().sort({ createdAt: -1 }).limit(200);
    res.json({ wallets });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Live on-chain USDC/USDT totals across configured treasury wallets.
// PHP has no on-chain equivalent, so it's excluded here.
async function getOnChainTreasuryBalances() {
  const totals = { USDC: 0, USDT: 0, FLOWER: 0 };
  const wallets = [
    { chainKey: 'BASE',  address: process.env.BASE_TREASURY_WALLET },
    { chainKey: 'RONIN', address: process.env.RONIN_TREASURY_WALLET || process.env.TREASURY_WALLET },
  ].filter(w => w.address);

  await Promise.all(wallets.map(async (w) => {
    try {
      const balances = await getAllBalancesForAddress(w.chainKey, w.address);
      for (const sym of ['USDC', 'USDT', 'FLOWER']) {
        if (typeof balances[sym] === 'number') totals[sym] += balances[sym];
      }
    } catch (err) {
      console.error(`[treasury] on-chain balance fetch failed for ${w.chainKey}:`, err.message);
    }
  }));

  return totals;
}

// ── GET /treasury/pools ───────────────────────────────────────────────────
// Returns live health of all liquidity pools (PHP, USDT, USDC), enriched
// with real on-chain treasury balances for USDC/USDT so ledger drift is
// visible instead of silently trusted.
const EXPECTED_CURRENCIES = ['PHP', 'USDT', 'USDC', 'FLOWER'];

// FLOWER trades at a much smaller per-unit USD value than USDC/USDT, so it
// gets its own minThreshold instead of inheriting the schema's 50000
// default (which would represent ~$3,250 at ~$0.065/FLOWER, not the
// intended ~$20 floor).
const POOL_MIN_THRESHOLDS = { FLOWER: 300 };

router.get('/pools', requireAuth, requireAdmin, async (req, res) => {
  try {
    const onChainTotals = await getOnChainTreasuryBalances();

    let pools = await PhpLiquidityPool.find();
    const existingCurrencies = new Set(pools.map(p => p.currency));
    const missing = EXPECTED_CURRENCIES.filter(c => !existingCurrencies.has(c));

    if (missing.length > 0) {
      // Auto-heal missing pool records using REAL on-chain balances, never
      // a fabricated starting number. PHP has no on-chain equivalent — it
      // starts honestly at 0 instead of a guessed figure.
      const toCreate = missing.map(currency => ({
        currency,
        balance: (currency === 'USDC' || currency === 'USDT' || currency === 'FLOWER')
          ? (onChainTotals[currency] ?? 0)
          : 0,
        reserved: 0,
        ...(POOL_MIN_THRESHOLDS[currency] !== undefined
          ? { minThreshold: POOL_MIN_THRESHOLDS[currency] }
          : {}),
      }));
      await PhpLiquidityPool.insertMany(toCreate);
      pools = await PhpLiquidityPool.find();
    }

    const health = pools.map(getPoolHealth);

    const enriched = health.map(h => {
      if (h.currency === 'USDC' || h.currency === 'USDT' || h.currency === 'FLOWER') {
        const onChainBalance = onChainTotals[h.currency] ?? null;
        return {
          ...h,
          onChainBalance,
          onChainDiff: onChainBalance !== null ? +(onChainBalance - h.balance).toFixed(6) : null,
        };
      }
      return { ...h, onChainBalance: null, onChainDiff: null };
    });

    res.json({ success: true, pools: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /treasury/pools/:currency/topup ──────────────────────────────────
// Admin manually tops up a pool (e.g. after injecting real USDT)
router.post('/pools/:currency/topup', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { currency } = req.params;
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const pool = await PhpLiquidityPool.findOneAndUpdate(
      { currency: currency.toUpperCase() },
      { $inc: { balance: parseFloat(amount) }, updatedAt: new Date() },
      { new: true, upsert: false }
    );
    if (!pool) return res.status(404).json({ error: `Pool for ${currency} not found` });

    res.json({ success: true, pool: getPoolHealth(pool) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /treasury/withdrawal-cap ───────────────────────────────────────────
// User-facing "how much can I withdraw right now" figure — deliberately
// NOT labeled or framed as the treasury's actual balance.
import { getWithdrawalCaps } from '../services/treasury/treasuryLiquidityService.js';

router.get('/withdrawal-cap', requireAuth, async (req, res) => {
  try {
    const caps = await getWithdrawalCaps();
    res.json({ success: true, withdrawalCap: caps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
