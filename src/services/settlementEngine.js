/**
 * settlementEngine.js  (UPDATED)
 * ─────────────────────────────────────────────────────────────
 * Routes cash-out to the right rail: Maya → GCash → Bank
 * Uses preferredRail hint from CashoutRequest.destinationType
 * Falls back through all rails on failure.
 */

import maya    from '../integrations/paymentProviders/mayaProvider.js';
import coinsph from '../integrations/paymentProviders/coinsphProvider.js';
import Transaction from '../models/transactionModel.js';

// Rail definitions — ordered by preference
const RAILS = {
  MAYA:    { key: 'maya',    label: 'Maya' },
  GCASH:   { key: 'coinsph', label: 'GCash via Coins.ph' },
  COINSPH: { key: 'coinsph', label: 'Coins.ph' },
  BANK:    { key: 'maya',    label: 'Bank via Maya' },   // Maya supports instapay
};

const DEFAULT_ORDER = ['maya', 'coinsph'];

class SettlementEngine {

  async settle(transaction) {
    // Build rail order: preferred first, then fallbacks
    const preferred = transaction.preferredRail
      ? RAILS[transaction.preferredRail]?.key
      : null;

    const order = preferred
      ? [preferred, ...DEFAULT_ORDER.filter(r => r !== preferred)]
      : DEFAULT_ORDER;

    const errors = [];

    for (const rail of order) {
      try {
        let result;

        if (rail === 'maya') {
          result = await maya.sendMoney({
            amount:  transaction.amount,
            account: transaction.receiverAddress,
          });
        }

        if (rail === 'coinsph') {
          result = await coinsph.sendMoney({
            amount:  transaction.amount,
            address: transaction.receiverAddress,
          });
        }

        if (result?.success) {
          await Transaction.findByIdAndUpdate(transaction._id, {
            settlementMethod: rail,
            settlementRef:    result.referenceId,
            status:           'settled',
          });

          console.log(`[settlementEngine] ✅ Settled via ${rail}, ref: ${result.referenceId}`);
          return { success: true, provider: rail, referenceId: result.referenceId };
        }

      } catch (err) {
        console.warn(`[settlementEngine] ⚠️ ${rail} failed:`, err.message);
        errors.push(`${rail}: ${err.message}`);
        continue;
      }
    }

    // All rails failed
    await Transaction.findByIdAndUpdate(transaction._id, { status: 'failed' });
    throw new Error(`All settlement rails failed: ${errors.join(' | ')}`);
  }
}

export default new SettlementEngine();
