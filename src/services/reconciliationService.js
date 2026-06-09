import Wallet from '../models/walletModel.js';
import LedgerEntry from '../models/ledger/ledgerEntryModel.js';

/**
 * RECONCILIATION ENGINE (AUDIT SYSTEM)
 */
class ReconciliationService {

  async reconcileWallet(walletId) {

    const wallet = await Wallet.findById(walletId);
    if (!wallet) throw new Error('Wallet not found');

    const entries = await LedgerEntry.find({ walletId });

    let debit = 0;
    let credit = 0;

    for (const e of entries) {
      if (e.direction === 'DEBIT') debit += e.amount;
      if (e.direction === 'CREDIT') credit += e.amount;
    }

    const computedBalance = credit - debit;
    const actualBalance = wallet.balance;

    const isConsistent = computedBalance === actualBalance;

    return {
      walletId,
      computedBalance,
      actualBalance,
      isConsistent,
      difference: actualBalance - computedBalance
    };
  }

  async reconcileAllWallets() {
    const wallets = await Wallet.find();

    const results = [];

    for (const wallet of wallets) {
      const result = await this.reconcileWallet(wallet._id);
      results.push(result);
    }

    return results;
  }
}

export default new ReconciliationService();
