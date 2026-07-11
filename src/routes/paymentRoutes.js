// PATH: ~/Desktop/iscansystem/src/routes/paymentRoutes.js

import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/authMiddleware.js';
import { cashIn, webhook } from '../controllers/paymentController.js';
import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import FeeRecord from '../models/feeModel.js';
import BankAccount from '../models/BankAccount.js';
import WithdrawalRequest from '../models/withdrawalRequestModel.js';
import walletService from '../services/walletService.js';
import { alertCashoutAwaitingRelease } from '../services/telegramAlertService.js';
import eventStreamService from '../services/eventStreamService.js';

const router = express.Router();

const getLedgerBalance = async (userId, currency = 'PHP') => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), currency } },
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
    const { amount, channel, purpose } = req.body;
    const php = parseFloat(amount);
    if (!php || php <= 0) return res.status(400).json({ error: 'Invalid amount.' });

    const validChannels = ['MAYA', 'GCASH', 'BANK'];
    const normalizedChannel = String(channel || '').toUpperCase();
    if (!validChannels.includes(normalizedChannel)) {
      return res.status(400).json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` });
    }

    // ── Look up the user's verified linked account for this channel ───────
    // Never trust receiverName/accountNumber from the request body directly:
    // without this, any authenticated user could cash out to an arbitrary
    // account they type in, not just their own linked one.
    const providerByChannel = { MAYA: 'maya', GCASH: 'gcash', BANK: 'bank' };
    const linkedAccount = await BankAccount.findOne({
      userId: req.user.id,
      provider: providerByChannel[normalizedChannel],
      status: 'active',
    }).lean();

    if (!linkedAccount) {
      return res.status(400).json({
        error: `No linked ${normalizedChannel} account found. Please link one in your profile before withdrawing.`,
        code: 'NO_LINKED_ACCOUNT',
      });
    }

    const receiverName   = linkedAccount.accountName;
    const accountNumber  = linkedAccount.accountNumber;

    const fee = parseFloat((php * 0.015).toFixed(2));
    const total = php + fee;
    const netAmount = php - fee;

    const bal = await walletService.getBalance(req.user.id, 'PHP');
    if (bal < total) return res.status(400).json({ error: `Insufficient balance. Available: ₱${bal.toFixed(2)}, needed: ₱${total.toFixed(2)}` });

    const ref = 'CO-' + crypto.randomBytes(8).toString('hex').toUpperCase();

    // ── Debit atomically first (same transaction-safe pattern crypto uses) ──
    // walletService.debit() uses a $gte guard + $inc as one indivisible
    // MongoDB operation, so two concurrent requests can never both read
    // "sufficient balance" and both succeed — closes the double-spend race
    // the old getLedgerBalance()-then-write pattern was vulnerable to.
    await walletService.debit(req.user.id, 'PHP', total, {
      referenceId: ref,
      description: `Cash out to ${receiverName} via ${normalizedChannel} (fee ₱${fee})`,
      transactionType: 'cashout',
    });

    let withdrawal;
    try {
      withdrawal = await WithdrawalRequest.create({
        userId: req.user.id,
        type: linkedAccount.provider, // 'maya' | 'bank' | 'gcash'
        asset: 'PHP',
        amount: php,
        fee,
        netAmount,
        referenceId: ref,
        destinationAccount: accountNumber,
        accountName: receiverName,
        status: 'pending_review',
      });
    } catch (createErr) {
      // WithdrawalRequest creation failed after the debit already went
      // through — refund immediately so no debit is ever left orphaned.
      await walletService.credit(req.user.id, 'PHP', total, {
        referenceId: 'REFUND-' + ref,
        description: `Refund — withdrawal request failed to record (${createErr.message})`,
        transactionType: 'cashout_refund',
      });
      throw createErr;
    }

    // ── PHP withdrawals always need a human to actually send the money —
    // alert admin immediately, same as crypto withdrawals that exceed the
    // auto-approve threshold and land in manual review.
    alertCashoutAwaitingRelease(withdrawal).catch(err => {
      console.error('[CASHOUT] Telegram alert failed:', err.message);
    });
    eventStreamService.emit('withdrawal.verified', {
      entityId: withdrawal.referenceId || withdrawal._id.toString(),
      userId: req.user.id,
      cashoutId: withdrawal._id.toString(),
      referenceId: withdrawal.referenceId,
      amount: withdrawal.amount,
      fee: withdrawal.fee,
      netAmount: withdrawal.netAmount,
      destinationType: normalizedChannel,
      destinationAccount: withdrawal.destinationAccount,
      message: `Cashout request verified and awaiting admin release — ₱${withdrawal.netAmount.toFixed(2)} to ${normalizedChannel} (${withdrawal.destinationAccount})`,
    }).catch(err => {
      console.error('[CASHOUT] System Inspector event emit failed:', err.message);
    });

    await FeeRecord.create({
      referenceId: 'FEE-' + ref,
      userId: req.user.id,
      txType: 'cashout',
      currency: 'PHP',
      grossAmount: php,
      feePercent: 1.5,
      feeAmount: fee,
      netAmount,
      metadata: { channel: normalizedChannel, receiverName, accountNumber, linkedAccountId: linkedAccount._id }
    });

    res.json({ success: true, referenceId: ref, amount: php, fee, total, withdrawal });
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
