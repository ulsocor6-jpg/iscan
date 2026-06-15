import Wallet from '../models/walletModel.js';
import crypto from 'crypto';

class WalletService {

  /**
   * CREATE OR GET USER WALLET
   */
  async getOrCreateWallet(userId) {

    let wallet = await Wallet.findOne({ userId });

    if (wallet) return wallet;

    wallet = await Wallet.create({
      userId,
      iscanAddress: 'ISCAN-' + crypto.randomBytes(8).toString('hex').toUpperCase(),
      balances: new Map([
        ['USDT', 0],
        ['USDC', 0],
        ['ETH', 0],
        ['PHP', 0]
      ]),
      linkedWallets: [],
      status: 'active'
    });

    return wallet;
  }

  /**
   * GET BALANCE (CACHE ONLY)
   */
  async getBalance(userId, asset = 'USDT') {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balances.get(asset) || 0;
  }

  /**
   * CREDIT CACHE (after ledger confirm)
   */
  async credit(userId, asset, amount) {
    const wallet = await this.getOrCreateWallet(userId);

    const current = wallet.balances.get(asset) || 0;
    wallet.balances.set(asset, current + Number(amount));

    wallet.markModified('balances');
    await wallet.save();

    return wallet;
  }

  /**
   * DEBIT CACHE (after ledger confirm)
   */
  async debit(userId, asset, amount) {
    const wallet = await this.getOrCreateWallet(userId);

    const current = wallet.balances.get(asset) || 0;

    if (current < amount) {
      throw new Error('Insufficient balance');
    }

    wallet.balances.set(asset, current - Number(amount));

    wallet.markModified('balances');
    await wallet.save();

    return wallet;
  }

}

export default new WalletService();
