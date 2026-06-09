import maya from '../integrations/paymentProviders/mayaProvider.js';
import coinsph from '../integrations/paymentProviders/coinsphProvider.js';
import Transaction from '../models/transactionModel.js';

/**
 * SETTLEMENT ENGINE (RETRY + PROVIDER ROUTING)
 */
class SettlementEngine {

  async settle(transaction) {

    const providers = [
      'maya',
      'coinsph'
    ];

    for (const provider of providers) {

      try {

        let result;

        if (provider === 'maya') {
          result = await maya.sendMoney({
            amount: transaction.amount,
            account: transaction.receiverAddress
          });
        }

        if (provider === 'coinsph') {
          result = await coinsph.sendMoney({
            amount: transaction.amount,
            address: transaction.receiverAddress
          });
        }

        // success → update transaction
        if (result?.success) {
          await Transaction.findByIdAndUpdate(transaction._id, {
            settlementMethod: provider,
            settlementRef: result.referenceId,
            status: 'settled'
          });

          return result;
        }

      } catch (err) {
        // try next provider
        continue;
      }
    }

    // all failed
    await Transaction.findByIdAndUpdate(transaction._id, {
      status: 'failed'
    });

    throw new Error('All settlement providers failed');
  }
}

export default new SettlementEngine();
