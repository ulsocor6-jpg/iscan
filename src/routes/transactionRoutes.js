// PATH: ~/Desktop/iscansystem/src/routes/transactionRoutes.js

import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/authMiddleware.js';
import Transaction from '../models/transactionModel.js';
import Ledger from '../models/ledgerModel.js';

const router = express.Router();

// GET /api/v1/transactions
// Dashboard calls this for overview stats and transaction history
// Supports: ?limit=20 ?type=cash_in ?type=cash_out
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit) || 20;
    const type   = req.query.type || null;
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Build from ledger entries (source of truth) + map to transaction shape
    const query = { userId };
    if (type === 'cash_in')  query.transactionType = 'cashin';
    if (type === 'cash_out') query.transactionType = 'cashout';

    const entries = await Ledger.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    // Map ledger entries to the shape dashboard expects
    const transactions = entries.map(e => ({
      _id:             e._id,
      referenceNumber: e.referenceId,
      type:            e.transactionType === 'cashin'  ? 'cash_in'
                     : e.transactionType === 'cashout' ? 'cash_out'
                     : e.transactionType,
      amount:          e.credit > 0 ? e.credit : e.debit,
      direction:       e.credit > 0 ? 'in' : 'out',
      currency:        e.currency || 'PHP',
      status:          e.status === 'completed' ? 'completed' : e.status,
      channel:         e.metadata?.channel || e.transactionType,
      description:     e.description,
      senderName:      e.counterpartyAddress || null,
      receiverName:    e.counterpartyAddress || null,
      userId:          e.userId,
      createdAt:       e.createdAt,
      metadata:        e.metadata || {}
    }));

    res.json({ success: true, transactions, total: transactions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/transactions/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true, transaction: tx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
