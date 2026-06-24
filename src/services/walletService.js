import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import crypto from 'crypto';
import { deriveUserWallets, SUPPORTED_CHAINS } from './hdWalletService.js';

class WalletService {
  async getOrCreateWallet(userId) {
    let wallet = await Wallet.findOne({ userId });
    if (wallet) return wallet;

    const walletIndex = await Wallet.countDocuments();
    const derived = await deriveUserWallets(walletIndex);
    const chainAddresses = Object.entries(derived).map(([chain, data]) => ({
      chain,
      address: data.address,
      chainId: SUPPORTED_CHAINS[chain].chainId,
      usdtBalance: 0,
      usdcBalance: 0
    }));

    wallet = await Wallet.create({
      userId,
      walletIndex,
      iscanAddress: 'ISCAN-' + crypto.randomBytes(8).toString('hex').toUpperCase(),
      chainAddresses,
      balances: new Map([['USDT', 0], ['USDC', 0], ['FLOWER', 0], ['RON', 0], ['ETH', 0], ['PHP', 0]]),
      linkedWallets: [],
      status: 'active'
    });
    return wallet;
  }

  async getBalance(userId, asset = 'USDT') {
    // Read from Ledger (source of truth), not wallet.balances Map
    const mongoose = (await import('mongoose')).default;
    const result = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId.toString()), currency: asset } },
      { $group: { _id: null, credit: { $sum: { $ifNull: ['$credit', 0] } }, debit: { $sum: { $ifNull: ['$debit', 0] } } } }
    ]);
    return result.length > 0 ? Math.max(0, result[0].credit - result[0].debit) : 0;
  }

  // referenceId/description let callers (swap services, etc.) pass
  // meaningful audit context. Falls back to a generated ref if omitted.
  async credit(userId, asset, amount, { referenceId, description, transactionType = 'credit' } = {}) {
    const wallet = await this.getOrCreateWallet(userId);
    await Ledger.create({
      referenceId: referenceId || ('CREDIT-' + crypto.randomBytes(8).toString('hex')),
      userId,
      transactionType,
      debit: 0,
      credit: Number(amount),
      currency: asset,
      description: description || `${asset} credit via walletService`,
      status: 'completed',
    });

    return wallet;
  }

  async debit(userId, asset, amount, { referenceId, description } = {}) {
    const wallet = await this.getOrCreateWallet(userId);
    // Check balance from Ledger before debiting
    const bal = await this.getBalance(userId, asset);
    if (bal < amount) throw new Error(`Insufficient ${asset} balance. Available: ${bal}`);

    await Ledger.create({
      referenceId: referenceId || ('DEBIT-' + crypto.randomBytes(8).toString('hex')),
      userId,
      transactionType: 'debit',
      debit: Number(amount),
      credit: 0,
      currency: asset,
      description: description || `${asset} debit via walletService`,
      status: 'completed',
    });

    return wallet;
  }
}

export default new WalletService();
