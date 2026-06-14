import moonpayService from '../integrations/moonpayService.js';
import cryptoDepositModel from '../models/cryptoDepositModel.js';
import webhookEventModel from '../models/webhookEventModel.js';

import settlementEngine from '../services/settlementEngine.js';
import blockchainScanner from '../services/blockchainScanner.js';
import ledgerService from '../services/ledgerService.js';
import walletService from '../services/walletService.js';

/**
 * MoonPay Webhook Controller
 * Handles payment confirmation + settlement trigger
 */
export const handleMoonPayWebhook = async (req, res) => {
  try {
    const signature = req.headers['moonpay-signature'];
    const rawBody = JSON.stringify(req.body);

    // 1. Verify webhook authenticity
    const isValid = moonpayService.verifyWebhook(rawBody, signature);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // 2. Store webhook event (audit trail)
    await webhookEventModel.create({
      provider: 'moonpay',
      eventType: event.type,
      payload: event,
      referenceId: event.externalTransactionId
    });

    // 3. Handle only successful completion
    if (event.type !== 'transaction_completed') {
      return res.json({ status: 'ignored' });
    }

    const {
      externalTransactionId,
      cryptoAmount,
      currencyCode,
      walletAddress,
      transactionId
    } = event;

    // 4. Create internal deposit record (PENDING SETTLEMENT)
    const deposit = await cryptoDepositModel.create({
      provider: 'moonpay',
      externalTransactionId,
      transactionId,
      walletAddress,
      cryptoAmount,
      currency: currencyCode,
      status: 'PENDING_CONFIRMATION'
    });

    // 5. Trigger blockchain verification
    await blockchainScanner.queueDeposit({
      walletAddress,
      amount: cryptoAmount,
      currency: currencyCode,
      referenceId: deposit._id
    });

    // 6. Let settlement engine finalize asynchronously
    await settlementEngine.enqueue({
      type: 'MOONPAY_DEPOSIT',
      referenceId: deposit._id
    });

    return res.json({ status: 'accepted' });
  } catch (err) {
    console.error('[MoonPayWebhook]', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
