import express from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import DirectDeposit from '../models/DirectDepositModel.js';
import walletService from '../services/walletService.js';
import Ledger from '../models/ledgerModel.js';

const router = express.Router();

router.post('/request', requireAuth, async (req, res) => {
  try {
    const { amount, channel = 'GCASH' } = req.body;
    const php = parseFloat(amount);
    if (!php || php < 20) return res.status(400).json({ error: 'Minimum deposit is P20' });
    if (php > 100000) return res.status(400).json({ error: 'Maximum deposit is P100,000' });

    const referenceId = 'ISCAN-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const deposit = await DirectDeposit.create({ userId: req.user.id, referenceId, amount: php, channel });

    res.json({
      success: true, referenceId, amount: php, channel, expiresAt: deposit.expiresAt,
      instructions: {
        gcash:   process.env.GCASH_NUMBER  || 'Not configured',
        bank:    process.env.BANK_ACCOUNT  || 'Not configured',
        name:    process.env.ACCOUNT_NAME  || 'ISCAN',
        message: `Send exactly P${php} with reference: ${referenceId}`
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/status/:referenceId', requireAuth, async (req, res) => {
  try {
    const deposit = await DirectDeposit.findOne({ referenceId: req.params.referenceId, userId: req.user.id });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    res.json({ success: true, deposit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const deposits = await DirectDeposit.find({ status: 'PENDING' })
      .populate('userId', 'email firstName lastName').sort({ createdAt: -1 });
    res.json({ success: true, deposits });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/confirm', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { referenceId, senderName, adminNote } = req.body;
    const deposit = await DirectDeposit.findOne({ referenceId });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status === 'CREDITED') return res.status(400).json({ error: 'Already credited' });

    await walletService.credit(deposit.userId.toString(), 'PHP', deposit.amount);

    await Ledger.create({
      referenceId, userId: deposit.userId,
      transactionType: 'cashin', debit: 0, credit: deposit.amount, currency: 'PHP',
      description: `Direct deposit via ${deposit.channel} from ${senderName || 'unknown'}`,
      status: 'completed'
    });

    deposit.status = 'CREDITED';
    deposit.creditedAt = new Date();
    deposit.senderName = senderName;
    deposit.adminNote = adminNote;
    await deposit.save();

    console.log(`[DEPOSIT] P${deposit.amount} credited to ${deposit.userId} ref:${referenceId}`);
    res.json({ success: true, credited: deposit.amount, referenceId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/cancel', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { referenceId, reason } = req.body;
    const deposit = await DirectDeposit.findOneAndUpdate(
      { referenceId }, { status: 'EXPIRED', adminNote: reason }, { new: true }
    );
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    res.json({ success: true, deposit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
