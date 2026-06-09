import Wallet from '../models/walletModel.js';
import LedgerEntry from '../models/ledger/ledgerEntryModel.js';

/**
 * LEDGER RECOVERY ENGINE (ISCAN SAFETY CORE)
 * Rebuilds wallet balance from LedgerEntry truth
 */
class LedgerRecoveryService {

  /**
   * REBUILD SINGLE WALLET
   */
  async rebuildWallet(walletId) {

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

    const oldBalance = wallet.balance;

    wallet.balance = computedBalance;
    wallet.availableBalance = computedBalance - wallet.frozenBalance;
    wallet.version += 1;

    await wallet.save();

    return {
      walletId,
      oldBalance,
      newBalance: computedBalance,
      fixed: oldBalance !== computedBalance
    };
  }

  /**
   * REBUILD ALL WALLETS (ADMIN RECOVERY MODE)
   */
  async rebuildAll() {

    const wallets = await Wallet.find();

    const results = [];

    for (const wallet of wallets) {
      const result = await this.rebuildWallet(wallet._id);
      results.push(result);
    }

    return results;
  }

  /**
   * VERIFY WITHOUT CHANGING (DRY RUN)
   */
  async auditWallet(walletId) {

    const wallet = await Wallet.findById(walletId);
    const entries = await LedgerEntry.find({ walletId });

    let debit = 0;
    let credit = 0;

    for (const e of entries) {
      if (e.direction === 'DEBIT') debit += e.amount;
      if (e.direction === 'CREDIT') credit += e.amount;
    }

    const computed = credit - debit;

    return {
      walletId,
      walletBalance: wallet.balance,
      ledgerBalance: computed,
      isConsistent: wallet.balance === computed,
      difference: wallet.balance - computed
    };
  }
}

export default new LedgerRecoveryService();
