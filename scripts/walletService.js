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
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balances.get(asset) || 0;
  }

  // referenceId/description let callers (swap services, etc.) pass
  // meaningful audit context. Falls back to a generated ref if omitted.
  async credit(userId, asset, amount, { referenceId, description } = {}) {
    const wallet = await this.getOrCreateWallet(userId);
    const current = wallet.balances.get(asset) || 0;
    wallet.balances.set(asset, current + Number(amount));
    wallet.markModified('balances');
    await wallet.save();

    await Ledger.create({
      referenceId: referenceId || ('CREDIT-' + crypto.randomBytes(8).toString('hex')),
      userId,
      transactionType: 'credit',
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
    const current = wallet.balances.get(asset) || 0;
    if (current < amount) {
      throw new Error('Insufficient balance');
    }
    wallet.balances.set(asset, current - Number(amount));
    wallet.markModified('balances');
    await wallet.save();

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
