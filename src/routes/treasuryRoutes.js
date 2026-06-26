// src/routes/treasuryRoutes.js — full replacement
import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import FeeRecord from '../models/feeModel.js';
import Wallet from '../models/walletModel.js';
import PhpLiquidityPool from '../models/phpLiquidityPool.js';
import { getPoolHealth } from '../services/treasury/treasuryBalancer.js';

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

// ── GET /treasury/pools ────────────────────────────────────────────────────
// Returns live health of all liquidity pools (PHP, USDT, USDC)
router.get('/pools', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pools = await PhpLiquidityPool.find();
    const health = pools.map(getPoolHealth);
    res.json({ success: true, pools: health });
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

export default router;
