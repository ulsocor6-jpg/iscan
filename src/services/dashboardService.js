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

    const CHAIN_META = {
      ETHEREUM: { name: 'Ethereum', token: 'ETH',  color: '#627EEA' },
      POLYGON:  { name: 'Polygon',  token: 'MATIC', color: '#8247E5' },
      BASE:     { name: 'Base',     token: 'ETH',   color: '#0052FF' },
      RONIN:    { name: 'Ronin',    token: 'RON',   color: '#1273EA' },
    };

    const portfolio = [];
    const seen = new Set();

    walletsData.forEach(wallet => {
      if (wallet.chainAddresses && wallet.chainAddresses.length > 0) {
        wallet.chainAddresses.forEach(ca => {
          const meta = CHAIN_META[ca.chain] || { name: ca.chain, token: ca.chain, color: '#94a3b8' };
          const key = `internal:${ca.chain}:${ca.address}`;
          if (seen.has(key)) return;
          seen.add(key);
          portfolio.push({
            type: 'internal', network: meta.name, chain: ca.chain,
            token: meta.token, color: meta.color,
            balance: ca.usdtBalance || 0, usdc: ca.usdcBalance || 0,
            address: ca.address,
          });
        });
      }
      if (wallet.linkedWallets && wallet.linkedWallets.length > 0) {
        wallet.linkedWallets.forEach(linked => {
          const key = `external:${linked.address}`;
          if (seen.has(key)) return;
          seen.add(key);
          portfolio.push({
            type: 'external', network: linked.network, token: linked.nativeToken,
            color: '#94a3b8', balance: linked.nativeBalance || 0,
            usdc: linked.usdcBalance || 0, address: linked.address,
            provider: linked.provider,
          });
        });
      }
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
