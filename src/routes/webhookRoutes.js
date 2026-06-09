import express from 'express';
import crypto from 'crypto';

import transactionService from '../services/transactionService.js';
import ledgerService from '../services/ledgerService.js';

const router = express.Router();

/**
 * VERIFY SIGNATURE (PROVIDER SECURITY LAYER)
 */
const verifySignature = (payload, signature, secret) => {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return hmac === signature;
};

/**
 * MAIN WEBHOOK ENTRY POINT
 * (used by Maya / Coins.ph / banks)
 */
router.post('/payment', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const secret = process.env.WEBHOOK_SECRET;

    const payload = req.body;

    // 1. SECURITY CHECK
    if (!verifySignature(payload, signature, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { referenceId, status, amount } = payload;

    // 2. FIND TRANSACTION
    const tx = await transactionService.findByReference(referenceId);

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 3. UPDATE BASED ON STATUS
    if (status === 'success') {
      await transactionService.markSettled(tx._id);
    }

    if (status === 'failed') {
      await transactionService.markFailed(tx._id);
    }

    return res.json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
