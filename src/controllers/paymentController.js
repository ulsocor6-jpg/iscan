
import crypto from 'crypto';
import mongoose from 'mongoose';
import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import WebhookEvent from '../models/webhookEventModel.js';
import { createCashInLink, verifyWebhookSignature } from '../services/paymentService.js';

/**
 * POST /api/v1/payment/cashin
 * Creates a PayMongo payment link and returns the checkout URL
 */
export const cashIn = async (req, res) => {
  try {
    const { amount } = req.body;
    const phpAmount = parseFloat(amount);

    if (!phpAmount || phpAmount < 20) {
      return res.status(400).json({ error: 'Minimum cash-in is ₱20.' });
    }
    if (phpAmount > 100000) {
      return res.status(400).json({ error: 'Maximum cash-in is ₱100,000.' });
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found.' });

    const { checkoutUrl, linkId, referenceId } = await createCashInLink({
      userId: req.user.id,
      amount: phpAmount,
      description: 'ISCAN Cash In - ₱' + phpAmount.toLocaleString()
    });

    return res.json({ success: true, checkoutUrl, linkId, referenceId });

  } catch (err) {
    console.error('[CASHIN ERROR]', err);
    return res.status(500).json({ error: 'Could not create payment link: ' + err.message });
  }
};

/**
 * POST /api/v1/payment/webhook
 * Receives PayMongo events and credits the user's ledger on payment
 */
export const webhook = async (req, res) => {
  try {
    const sigHeader = req.headers['paymongo-signature'];
    const rawBody = req.rawBody; // set by express middleware below

    // Verify signature
    if (sigHeader && process.env.PAYMONGO_WEBHOOK_SECRET) {
      const valid = verifyWebhookSignature(rawBody, sigHeader, process.env.PAYMONGO_WEBHOOK_SECRET);
      if (!valid) {
        console.warn('[WEBHOOK] Invalid signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body;
    const eventType = event?.data?.attributes?.type;
    const eventId = event?.data?.id;

    // Idempotency — skip already processed events
    const existing = await WebhookEvent.findOne({ eventId });
    if (existing?.processed) {
      return res.json({ received: true, skipped: true });
    }

    // Save event record
    await WebhookEvent.findOneAndUpdate(
      { eventId },
      { eventId, provider: 'maya', type: eventType, payload: event },
      { upsert: true }
    );

    // Only process payment events
    const paidEvents = ['link.payment.paid', 'payment.paid', 'source.chargeable'];
    if (!paidEvents.includes(eventType)) {
      return res.json({ received: true, eventType, action: 'ignored' });
    }

    // Extract amount and remarks (remarks = userId|referenceId)
    const attrs = event?.data?.attributes?.data?.attributes || event?.data?.attributes;
    const amountCentavos = attrs?.amount || 0;
    const phpAmount = amountCentavos / 100;
    const remarks = attrs?.remarks || '';
    const [userId, referenceId] = remarks.split('|');

    if (!userId || !phpAmount) {
      console.warn('[WEBHOOK] Missing userId or amount in remarks:', remarks);
      return res.json({ received: true, warning: 'Could not extract userId from remarks' });
    }

    // Find wallet
    const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!wallet) {
      console.warn('[WEBHOOK] Wallet not found for userId:', userId);
      return res.json({ received: true, warning: 'Wallet not found' });
    }

    // Credit the ledger
    await Ledger.create({
      referenceId: referenceId || 'WEBHOOK-' + eventId,
      userId: new mongoose.Types.ObjectId(userId),
      transactionType: 'cashin',
      debit: 0,
      credit: phpAmount,
      currency: 'PHP',
      description: 'Cash in via PayMongo (' + (attrs?.source?.type || 'card') + ')',
      status: 'completed',
      metadata: { eventId, eventType, paymongoData: attrs }
    });

    // Sync wallet balance
    const result = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, c: { $sum: { $ifNull: ['$credit', 0] } }, d: { $sum: { $ifNull: ['$debit', 0] } } } }
    ]);
    const newBalance = result.length > 0 ? result[0].c - result[0].d : 0;
    await Wallet.findByIdAndUpdate(wallet._id, { balance: newBalance });

    // Mark webhook as processed
    await WebhookEvent.findOneAndUpdate({ eventId }, { processed: true, processedAt: new Date() });

    console.log('[WEBHOOK] Credited ₱' + phpAmount + ' to userId ' + userId);
    return res.json({ received: true, credited: phpAmount, userId });

  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
