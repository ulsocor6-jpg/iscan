import Transaction from '../models/transactionModel.js';
import Wallet from '../models/walletModel.js';

class DashboardService {

  /**
   * LIVE SYSTEM OVERVIEW
   */
  async getOverview() {

    const totalTx = await Transaction.countDocuments();
    const settled = await Transaction.countDocuments({ status: 'settled' });
    const failed = await Transaction.countDocuments({ status: 'failed' });

    return {
      totalTransactions: totalTx,
      successRate: totalTx ? (settled / totalTx) * 100 : 0,
      failureRate: totalTx ? (failed / totalTx) * 100 : 0
    };
  }

  /**
   * LIVE FRAUD SIGNALS
   */
  async getRiskSignals() {

    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const tx = await Transaction.find({
      createdAt: { $gte: lastHour }
    });

    const totalVolume = tx.reduce((a, t) => a + t.amount, 0);

    return {
      transactions: tx.length,
      volume: totalVolume,
      average: tx.length ? totalVolume / tx.length : 0
    };
  }

  /**
   * SYSTEM HEALTH
   */
  async getHealth() {

    const wallets = await Wallet.countDocuments();

    return {
      wallets,
      systemStatus: 'OPERATIONAL'
    };
  }
}

export default new DashboardService();
