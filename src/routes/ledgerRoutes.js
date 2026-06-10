import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../../middleware/authMiddleware.js';
import Ledger from '../models/ledgerModel.js';
import Transaction from '../models/transactionModel.js';

const router = express.Router();

// GET /api/v1/ledger/history  — full ledger with running balance
router.get('/history', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const entries = await Ledger.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    // Compute running balance per entry
    let running = 0;
    const withBalance = [...entries].reverse().map(e => {
      running += (e.credit || 0) - (e.debit || 0);
      return { ...e.toObject(), runningBalance: parseFloat(running.toFixed(2)) };
    }).reverse();

    res.json({ success: true, entries: withBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/ledger  — alias for history (dashboard calls this)
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const entries = await Ledger.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
