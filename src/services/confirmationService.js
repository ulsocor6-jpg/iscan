import blockchainScanner from './blockchainScanner.js';
import ledgerService from './ledgerService.js';
import Wallet from '../models/walletModel.js';
import cryptoDepositModel from '../models/cryptoDepositModel.js';

/**
 * CONFIRMATION SERVICE
 * Ensures blockchain finality before crediting users
 */
class ConfirmationService {

  /**
   * Confirm deposit and settle to ledger
   */
  async confirmDeposit(tx) {

    // 1. Check if already processed (idempotency)
    const existing = await cryptoDepositModel.findOne({
      txHash: tx.txHash
    });

    if (existing?.status === 'SETTLED') {
      return { skipped: true };
    }

    // 2. Validate wallet
    const wallet = await Wallet.findOne({
      address: tx.to
    });

    if (!wallet) {
      throw new Error('Unknown deposit address');
    }

    // 3. Block confirmation threshold
    if (tx.confirmations < 12) {
      return { status: 'PENDING_CONFIRMATION' };
    }

    // 4. Create or update deposit record
    const deposit = await cryptoDepositModel.findOneAndUpdate(
      { txHash: tx.txHash },
      {
        userId: wallet.userId,
        amount: tx.amount,
        asset: tx.asset,
        status: 'CONFIRMED'
      },
      { upsert: true, new: true }
    );

    // 5. FINAL SETTLEMENT → ledger credit
    await ledgerService.credit({
      userId: wallet.userId,
      amount: tx.amount,
      type: 'CRYPTO_DEPOSIT',
      referenceId: tx.txHash
    });

    // 6. Mark as settled
    deposit.status = 'SETTLED';
    await deposit.save();

    return {
      status: 'SETTLED',
      userId: wallet.userId
    };
  }
}

export default new ConfirmationService();
