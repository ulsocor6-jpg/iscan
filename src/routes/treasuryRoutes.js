import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import FeeRecord from '../models/feeModel.js';
import Wallet from '../models/walletModel.js';

const router = express.Router();

router.get('/fees', requireAuth, async (req, res) => {
  try {
    const now   = new Date();
    const day1  = new Date(now - 1  * 24 * 60 * 60 * 1000);
    const day7  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const day365 = new Date(now - 365 * 24 * 60 * 60 * 1000);
    const day30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [all, year, month, week, day, recent, byType] = await Promise.all([
      FeeRecord.aggregate([{ $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day365 } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day30 } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day7  } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.aggregate([{ $match: { createdAt: { $gte: day1  } } }, { $group: { _id: '$currency', total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }]),
      FeeRecord.find().sort({ createdAt: -1 }).limit(50),
      FeeRecord.aggregate([{ $group: { _id: { type: '$txType', currency: '$currency' }, total: { $sum: '$feeAmount' }, count: { $sum: 1 } } }])
    ]);

    res.json({ all, year, month, week, day, recent, byType });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/wallets', requireAuth, async (req, res) => {
  try {
    const wallets = await Wallet.find().sort({ createdAt: -1 }).limit(200);
    res.json({ wallets });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
