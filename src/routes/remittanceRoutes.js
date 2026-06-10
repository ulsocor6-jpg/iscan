import express from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/authMiddleware.js';
import Transaction from '../models/transactionModel.js';
import { getLiveRate, sendToCoinsph } from '../integrations/coinsph.js';
import Audit from '../models/auditModel.js';

const router = express.Router();

// GET live rates
router.get('/rates', async (req, res) => {
  try {
    const [usdcRate, ethRate, ronRate] = await Promise.all([
  getLiveRate('USDC'), getLiveRate('ETH'), getLiveRate('RON')
]);
res.json({ success: true, rates: { USDC: usdcRate, ETH: ethRate, RON: ronRate } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch rates.' });
  }
});

// POST send remittance
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderAddress, receiverAddress, receiverEmail, amount, currency, notes } = req.body;

    if (!senderAddress || !receiverAddress || !amount || !currency) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const rate = await getLiveRate(currency);
    const phpEquivalent = rate ? parseFloat((amount * rate).toFixed(2)) : null;
    const fee = parseFloat((amount * 0.005).toFixed(6)); // 0.5% fee
    const referenceId = 'ISCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    const transaction = await Transaction.create({
      senderId:         req.user.id,
      senderAddress,
      receiverAddress,
      receiverEmail,
      amount,
      currency,
      phpEquivalent,
      rateAtSend:       rate,
      fee,
      type:             'remittance',
      status:           'pending',
      settlementMethod: 'manual',
      referenceId,
      notes
    });

    await Audit.create({
      userId:    req.user.id,
      userEmail: req.user.email,
      action:    'REMITTANCE_SENT',
      entity:    'Transaction',
      entityId:  transaction._id.toString(),
      details:   { amount, currency, phpEquivalent, referenceId },
      status:    'success'
    });

    res.json({ success: true, transaction });

  } catch (err) {
    console.error('[SEND ERROR]:', err);
    res.status(500).json({ message: 'Failed to process remittance.' });
  }
});

// GET transaction history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ senderId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load history.' });
  }
});

// GET all pending for settlement (admin use)
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const pending = await Transaction.find({ status: 'pending' })
      .sort({ createdAt: -1 });
    res.json({ success: true, transactions: pending });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load pending.' });
  }
});

// POST settle a transaction
router.post('/settle/:id', requireAuth, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found.' });
    if (tx.status !== 'pending') return res.status(400).json({ message: 'Transaction already settled.' });

    const result = await sendToCoinsph({
      amount:          tx.phpEquivalent || tx.amount,
      currency:        tx.currency,
      recipientPhone:  req.body.recipientPhone,
      referenceId:     tx.referenceId
    });

    tx.status = result.mock ? 'pending' : 'settled';
    tx.settlementRef = result.referenceId || 'MOCK';
    tx.settlementMethod = 'coinsph';
    await tx.save();

    await Audit.create({
      userId:    req.user.id,
      userEmail: req.user.email,
      action:    'SETTLEMENT_TRIGGERED',
      entity:    'Transaction',
      entityId:  tx._id.toString(),
      details:   { result, mock: result.mock },
      status:    'success'
    });

    res.json({ success: true, result, transaction: tx });

  } catch (err) {
    console.error('[SETTLE ERROR]:', err);
    res.status(500).json({ message: 'Settlement failed.' });
  }
});

// GET audit trail
router.get('/audit', requireAuth, async (req, res) => {
  try {
    const logs = await Audit.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load audit trail.' });
  }
});

export default router;
