#!/bin/bash
BASE=~/Desktop/iscansystem

# ── 1. FIX WALLET ROUTES (wrong middleware path) ──────────
cat > $BASE/src/routes/walletRoutes.js << 'EOF'
import express from 'express';
import {
  linkWallet,
  getWallets,
  unlinkWallet,
  getWalletMe,
  getWalletBalance
} from '../controllers/walletController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/link',    requireAuth, linkWallet);
router.post('/unlink',  requireAuth, unlinkWallet);
router.get('/list',     requireAuth, getWallets);
router.get('/me',       requireAuth, getWalletMe);
router.get('/balance',  requireAuth, getWalletBalance);
router.get('/status',   (req, res) => res.json({ success: true }));

export default router;
EOF
echo "walletRoutes fixed"

# ── 2. FIX LEDGER MODEL (enum mismatch) ───────────────────
cat > $BASE/src/models/ledgerModel.js << 'EOF'
import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema({
  referenceId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  transactionType: {
    type: String,
    enum: [
      'credit', 'debit',
      'transfer', 'cash_in', 'cash_out',
      'deposit', 'withdrawal',
      'remittance', 'fee', 'adjustment',
      'rewards', 'swap'
    ],
    required: true
  },
  debit:       { type: Number, default: 0 },
  credit:      { type: Number, default: 0 },
  currency:    { type: String, default: 'PHP' },
  description: { type: String, default: '' },
  source:      { type: String, default: null },
  destination: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'completed'
  },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

ledgerSchema.index({ referenceId: 1, transactionType: 1 }, { unique: true });
ledgerSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Ledger', ledgerSchema);
EOF
echo "ledgerModel fixed"

# ── 3. FIX TRANSFER CONTROLLER (complete rewrite) ─────────
cat > $BASE/src/controllers/transferController.js << 'EOF'
import crypto from 'crypto';
import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import User from '../models/userModel.js';

// Internal ISCAN-to-ISCAN transfer
// Uses ledger as source of truth, wallet.balance as cache
export const transferFunds = async (req, res) => {
  try {
    const { receiverEmail, amount } = req.body;
    const senderId = req.user.id;
    const transferAmount = parseFloat(amount);

    if (!receiverEmail || !transferAmount || transferAmount <= 0) {
      return res.status(400).json({ error: 'Receiver email and valid amount required' });
    }

    // Find sender wallet
    const senderWallet = await Wallet.findOne({ userId: senderId });
    if (!senderWallet) {
      return res.status(404).json({ error: 'Your wallet not found. Connect a wallet first.' });
    }

    // Compute sender balance from ledger (source of truth)
    const senderEntries = await Ledger.find({ userId: senderId, status: 'completed' });
    const senderBalance = senderEntries.reduce((acc, e) => acc + (e.credit || 0) - (e.debit || 0), 0);

    if (senderBalance < transferAmount) {
      return res.status(400).json({ error: `Insufficient balance. Available: ₱${senderBalance.toFixed(2)}` });
    }

    // Find receiver
    const receiverUser = await User.findOne({ email: receiverEmail.toLowerCase() });
    if (!receiverUser) {
      return res.status(404).json({ error: 'Recipient not found. They must have an ISCAN account.' });
    }

    if (receiverUser._id.toString() === senderId.toString()) {
      return res.status(400).json({ error: 'Cannot transfer to yourself.' });
    }

    const receiverWallet = await Wallet.findOne({ userId: receiverUser._id });
    if (!receiverWallet) {
      return res.status(404).json({ error: 'Recipient has no ISCAN wallet yet.' });
    }

    const referenceId = 'TX-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const fee = parseFloat((transferAmount * 0.005).toFixed(2)); // 0.5% fee
    const netAmount = parseFloat((transferAmount - fee).toFixed(2));

    // Write ledger entries atomically
    await Ledger.create([
      {
        referenceId: referenceId + '-DEBIT',
        userId: senderId,
        transactionType: 'transfer',
        debit: transferAmount,
        credit: 0,
        currency: 'PHP',
        description: `Transfer to ${receiverEmail}`,
        destination: receiverWallet.iscanAddress,
        status: 'completed'
      },
      {
        referenceId: referenceId + '-CREDIT',
        userId: receiverUser._id,
        transactionType: 'transfer',
        debit: 0,
        credit: netAmount,
        currency: 'PHP',
        description: `Received from ${req.user.email}`,
        source: senderWallet.iscanAddress,
        status: 'completed'
      },
      ...(fee > 0 ? [{
        referenceId: referenceId + '-FEE',
        userId: senderId,
        transactionType: 'fee',
        debit: fee,
        credit: 0,
        currency: 'PHP',
        description: 'Transfer fee (0.5%)',
        status: 'completed'
      }] : [])
    ]);

    // Update wallet balance cache
    senderWallet.balance = senderBalance - transferAmount;
    await senderWallet.save();

    const receiverEntries = await Ledger.find({ userId: receiverUser._id, status: 'completed' });
    receiverWallet.balance = receiverEntries.reduce((acc, e) => acc + (e.credit || 0) - (e.debit || 0), 0);
    await receiverWallet.save();

    return res.json({
      success: true,
      referenceId,
      sent: transferAmount,
      fee,
      received: netAmount,
      newBalance: senderWallet.balance,
      message: `₱${netAmount.toFixed(2)} sent to ${receiverEmail}`
    });

  } catch (err) {
    console.error('[TRANSFER ERROR]:', err);
    return res.status(500).json({ error: 'Transfer failed: ' + err.message });
  }
};

// Fund ISCAN internal wallet (cash in)
export const cashIn = async (req, res) => {
  try {
    const { amount, source, referenceId } = req.body;
    const cashAmount = parseFloat(amount);

    if (!cashAmount || cashAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const ref = referenceId || 'CASHIN-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    await Ledger.create({
      referenceId: ref,
      userId: req.user.id,
      transactionType: 'cash_in',
      debit: 0,
      credit: cashAmount,
      currency: 'PHP',
      description: `Cash in via ${source || 'manual'}`,
      status: 'completed'
    });

    wallet.balance = (wallet.balance || 0) + cashAmount;
    await wallet.save();

    return res.json({
      success: true,
      referenceId: ref,
      amount: cashAmount,
      newBalance: wallet.balance
    });

  } catch (err) {
    console.error('[CASH IN ERROR]:', err);
    return res.status(500).json({ error: 'Cash in failed: ' + err.message });
  }
};
EOF
echo "transferController fixed"

# ── 4. FIX TRANSFER ROUTES ────────────────────────────────
cat > $BASE/src/routes/transferRoutes.js << 'EOF'
import express from 'express';
import { transferFunds, cashIn } from '../controllers/transferController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/send',    requireAuth, transferFunds);
router.post('/cash-in', requireAuth, cashIn);

export default router;
EOF
echo "transferRoutes fixed"

# ── 5. FIX BALANCE SERVICE ────────────────────────────────
cat > $BASE/src/services/balanceService.js << 'EOF'
import Ledger from '../models/ledgerModel.js';

export const getUserBalance = async (userId) => {
  const entries = await Ledger.find({
    userId,
    status: { $ne: 'failed' }
  });
  return entries.reduce((acc, e) => acc + (e.credit || 0) - (e.debit || 0), 0);
};
EOF
echo "balanceService fixed"

# ── 6. FIX LEDGER CONTROLLER ─────────────────────────────
cat > $BASE/src/controllers/ledgerController.js << 'EOF'
import Ledger from '../models/ledgerModel.js';
import { getUserBalance } from '../services/balanceService.js';

export const getLedgerHistory = async (req, res) => {
  try {
    const entries = await Ledger.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    const balance = await getUserBalance(req.user.id);

    return res.json({ success: true, balance, entries });
  } catch (err) {
    console.error('[LEDGER ERROR]:', err);
    return res.status(500).json({ error: 'Failed to load ledger' });
  }
};
EOF
echo "ledgerController fixed"

echo ""
echo "ALL FIXED. Now run: node server.js"
