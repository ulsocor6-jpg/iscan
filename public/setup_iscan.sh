#!/bin/bash
BASE=~/Desktop/iscansystem

# transactionModel.js
cat > $BASE/src/models/transactionModel.js << 'EOF'
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  senderId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderAddress:   { type: String, required: true },
  receiverAddress: { type: String, required: true },
  receiverEmail:   { type: String },
  amount:          { type: Number, required: true, min: 0.0001 },
  currency:        { type: String, enum: ['ETH', 'USDC', 'MATIC'], default: 'USDC' },
  phpEquivalent:   { type: Number },
  rateAtSend:      { type: Number },
  fee:             { type: Number, default: 0 },
  type:            { type: String, enum: ['transfer', 'cashin', 'cashout', 'remittance'], default: 'remittance' },
  status:          { type: String, enum: ['pending', 'processing', 'settled', 'failed'], default: 'pending' },
  settlementMethod:{ type: String, enum: ['coinsph', 'paymongo', 'bank', 'manual'], default: 'manual' },
  settlementRef:   { type: String },
  referenceId:     { type: String, unique: true },
  notes:           { type: String }
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);
EOF
echo "transactionModel done"

# auditModel.js
cat > $BASE/src/models/auditModel.js << 'EOF'
import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: { type: String },
  action:    { type: String, required: true },
  entity:    { type: String },
  entityId:  { type: String },
  details:   { type: mongoose.Schema.Types.Mixed },
  ip:        { type: String },
  status:    { type: String, enum: ['success', 'failed'], default: 'success' }
}, { timestamps: true });

export default mongoose.model('Audit', auditSchema);
EOF
echo "auditModel done"

# coinsph.js
cat > $BASE/src/integrations/coinsph.js << 'EOF'
const COINSPH_API = 'https://api.coins.ph/v3';
const API_KEY = process.env.COINSPH_API_KEY || null;

export const sendToCoinsph = async ({ amount, currency, recipientPhone, referenceId }) => {
  if (!API_KEY) {
    return {
      success: true,
      mock: true,
      message: 'Coins.ph API key not yet configured. Settlement queued.',
      referenceId,
      amount,
      currency
    };
  }
  // Live — uncomment when API key is ready
  // const res = await fetch(`${COINSPH_API}/sellorder`, { ... });
};

export const getLiveRate = async (currency = 'USDC') => {
  try {
    const coinMap = { USDC: 'usd-coin', ETH: 'ethereum', MATIC: 'matic-network' };
    const coinId = coinMap[currency] || 'usd-coin';
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=php`);
    const data = await res.json();
    return data[coinId]?.php || null;
  } catch (err) {
    console.error('[RATE FETCH ERROR]:', err.message);
    return null;
  }
};
EOF
echo "coinsph done"

# remittanceRoutes.js
cat > $BASE/src/routes/remittanceRoutes.js << 'EOF'
import express from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/authMiddleware.js';
import Transaction from '../models/transactionModel.js';
import Audit from '../models/auditModel.js';
import { getLiveRate, sendToCoinsph } from '../integrations/coinsph.js';

const router = express.Router();

router.get('/rates', async (req, res) => {
  try {
    const [usdcRate, ethRate] = await Promise.all([getLiveRate('USDC'), getLiveRate('ETH')]);
    res.json({ success: true, rates: { USDC: usdcRate, ETH: ethRate } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch rates.' });
  }
});

router.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderAddress, receiverAddress, receiverEmail, amount, currency, notes } = req.body;
    if (!senderAddress || !receiverAddress || !amount || !currency) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    const rate = await getLiveRate(currency);
    const fee = parseFloat((amount * 0.005).toFixed(6));
    const phpEquivalent = rate ? parseFloat(((amount - fee) * rate).toFixed(2)) : null;
    const referenceId = 'ISCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    const transaction = await Transaction.create({
      senderId: req.user.id, senderAddress, receiverAddress, receiverEmail,
      amount, currency, phpEquivalent, rateAtSend: rate, fee,
      type: 'remittance', status: 'pending', referenceId, notes
    });

    await Audit.create({
      userId: req.user.id, userEmail: req.user.email,
      action: 'REMITTANCE_SENT', entity: 'Transaction',
      entityId: transaction._id.toString(),
      details: { amount, currency, phpEquivalent, referenceId }, status: 'success'
    });

    res.json({ success: true, transaction });
  } catch (err) {
    console.error('[SEND ERROR]:', err);
    res.status(500).json({ message: 'Failed to process remittance.' });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ senderId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load history.' });
  }
});

router.get('/pending', requireAuth, async (req, res) => {
  try {
    const pending = await Transaction.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json({ success: true, transactions: pending });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load pending.' });
  }
});

router.post('/settle/:id', requireAuth, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found.' });
    if (tx.status !== 'pending') return res.status(400).json({ message: 'Already settled.' });

    const result = await sendToCoinsph({
      amount: tx.phpEquivalent || tx.amount, currency: tx.currency,
      recipientPhone: req.body.recipientPhone, referenceId: tx.referenceId
    });

    tx.status = result.mock ? 'pending' : 'settled';
    tx.settlementRef = result.referenceId || 'MOCK';
    tx.settlementMethod = 'coinsph';
    await tx.save();

    await Audit.create({
      userId: req.user.id, userEmail: req.user.email,
      action: 'SETTLEMENT_TRIGGERED', entity: 'Transaction',
      entityId: tx._id.toString(),
      details: { result, mock: result.mock }, status: 'success'
    });

    res.json({ success: true, result, transaction: tx });
  } catch (err) {
    console.error('[SETTLE ERROR]:', err);
    res.status(500).json({ message: 'Settlement failed.' });
  }
});

router.get('/audit', requireAuth, async (req, res) => {
  try {
    const logs = await Audit.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load audit trail.' });
  }
});

export default router;
EOF
echo "remittanceRoutes done"

echo "ALL FILES WRITTEN"
