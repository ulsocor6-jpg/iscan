// PATH: ~/Desktop/iscansystem/src/routes/paymentRoutes.js

import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { cashIn, webhook } from '../controllers/paymentController.js';
import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import CashoutRequest from '../models/CashoutRequest.js';

const router = express.Router();

const getLedgerBalance = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, c: { $sum: { $ifNull: ['$credit',0] } }, d: { $sum: { $ifNull: ['$debit',0] } } } }
  ]);
  return result.length > 0 ? result[0].c - result[0].d : 0;
};

// POST /api/v1/payment/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body.toString('utf8');
  try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
  next();
}, webhook);

// POST /api/v1/payment/cashin
router.post('/cashin', requireAuth, cashIn);

// POST /api/v1/payment/cashout
router.post('/cashout', requireAuth, async (req, res) => {
  try {
    const { amount, channel, receiverName, accountNumber, purpose } = req.body;
    const php = parseFloat(amount);
    if (!php || php <= 0) return res.status(400).json({ error: 'Invalid amount.' });
    if (!receiverName) return res.status(400).json({ error: 'Receiver name required.' });

    const bal = await getLedgerBalance(req.user.id);
    const fee = parseFloat((php * 0.015).toFixed(2));
    const total = php + fee;

    if (bal < total) return res.status(400).json({ error: `Insufficient balance. Available: ₱${bal.toFixed(2)}, needed: ₱${total.toFixed(2)}` });

    const ref = 'CO-' + crypto.randomBytes(8).toString('hex').toUpperCase();

    await Ledger.create({
      referenceId: ref,
      userId: new mongoose.Types.ObjectId(req.user.id),
      transactionType: 'cashout',
      debit: total,
      credit: 0,
      currency: 'PHP',
      description: `Cash out to ${receiverName} via ${channel} (fee ₱${fee})`,
      status: 'completed'
    });

    const co = await CashoutRequest.create({
      userId: req.user.id,
      amount: php,
      destinationType: channel.toUpperCase(),
      destinationAccount: accountNumber,
      status: 'PENDING'
    });

    await Wallet.findOneAndUpdate({ userId: req.user.id }, { balance: await getLedgerBalance(req.user.id) });

    res.json({ success: true, referenceId: ref, amount: php, fee, total, cashoutRequest: co });
  } catch (e) {
    console.error('[CASHOUT]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/payment/rate
router.get('/rate', async (req, res) => {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=php');
    const d = await r.json();
    res.json({ success: true, rate: d?.usd?.php || 56.5 });
  } catch {
    res.json({ success: true, rate: 56.5 });
  }
});

export default router;
