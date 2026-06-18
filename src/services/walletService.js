import Wallet from '../models/walletModel.js';
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

  async credit(userId, asset, amount) {
    const wallet = await this.getOrCreateWallet(userId);
    const current = wallet.balances.get(asset) || 0;
    wallet.balances.set(asset, current + Number(amount));
    wallet.markModified('balances');
    await wallet.save();
    return wallet;
  }

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
