import Transaction from "../models/transactionModel.js";
import Wallet from "../models/walletModel.js";

class DashboardService {

  async getOverview() {

    const totalTransactions =
      await Transaction.countDocuments();

    const settled =
      await Transaction.countDocuments({
        status: "settled"
      });

    const failed =
      await Transaction.countDocuments({
        status: "failed"
      });

    const wallets =
      await Wallet.countDocuments();

    const activeWallets =
      await Wallet.countDocuments({
        status: "active"
      });

    const txVolumeAgg =
      await Transaction.aggregate([
        {
          $group: {
            _id: null,
            volume: { $sum: "$amount" }
          }
        }
      ]);

    const totalVolume =
      txVolumeAgg[0]?.volume || 0;

    const recentTransactions =
      await Transaction.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

    const walletsData =
      await Wallet.find()
        .limit(20)
        .lean();

    const portfolio = [];

    walletsData.forEach(wallet => {

      if (!wallet.linkedWallets) return;

      wallet.linkedWallets.forEach(linked => {

        portfolio.push({
          network: linked.network,
          token: linked.nativeToken,
          balance: linked.nativeBalance,
          usdc: linked.usdcBalance
        });

      });

    });

    return {

      hero: {
        totalVolume,
        totalTransactions
      },

      kpi: {
        totalTransactions,

        successRate:
          totalTransactions > 0
            ? (settled / totalTransactions) * 100
            : 0,

        failureRate:
          totalTransactions > 0
            ? (failed / totalTransactions) * 100
            : 0,

        wallets,
        activeWallets
      },

      treasury: {
        wallets,
        activeWallets,
        liquidityRatio:
          wallets > 0
            ? (activeWallets / wallets) * 100
            : 100
      },

      compliance: {
        approved: activeWallets,
        pending: wallets - activeWallets,
        rejected: 0,
        amlAlerts: 0
      },

      portfolio,

      activity: recentTransactions.map(tx => ({
        reference: tx.referenceId,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        createdAt: tx.createdAt
      }))
    };
  }

  async getRiskSignals() {

    const lastHour =
      new Date(Date.now() - 3600000);

    const tx =
      await Transaction.find({
        createdAt: { $gte: lastHour }
      });

    const volume =
      tx.reduce(
        (sum, t) => sum + (t.amount || 0),
        0
      );

    return {
      transactions: tx.length,
      volume
    };
  }

  async getHealth() {

    const wallets =
      await Wallet.countDocuments();

    return {
      wallets,
      systemStatus: "OPERATIONAL"
    };
  }
}

export default new DashboardService();
