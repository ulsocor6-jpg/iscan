import express from 'express';
import crypto from 'crypto';

import transactionService from '../services/transactionService.js';
import { LedgerService } from '../services/ledgerService.js';
import transakProvider from '../integrations/paymentProviders/transakProvider.js';

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
 * TRANSAK WEBHOOK
 */
router.post('/transak', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-transak-signature'];
    const payload = JSON.parse(req.body);

    // 1. SECURITY CHECK
    if (!transakProvider.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { eventType, data } = payload;
    const { partnerOrderId, status, cryptoAmount, transactionHash } = data;

    // 2. FIND TRANSACTION by referenceId
    const tx = await transactionService.findByReference(partnerOrderId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 3. UPDATE BASED ON STATUS
    if (eventType === 'ORDER_COMPLETED' && status === 'COMPLETED') {
      await transactionService.transitionTo(tx._id, 'ONRAMP_COMPLETED', {
        cryptoAmount,
        txHash: transactionHash,
      });

      // Credit crypto amount to internal ledger if needed
      await LedgerService.creditCrypto(tx.userId, cryptoAmount, transactionHash);
    }

    if (eventType === 'ORDER_FAILED') {
      await transactionService.transitionTo(tx._id, 'FAILED');
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[TRANSAK WEBHOOK ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
});

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

    const { referenceId, status } = payload;

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
