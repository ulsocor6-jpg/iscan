import Ledger from '../models/ledgerModel.js';
import Wallet from '../models/walletModel.js';

/**
 * SOURCE OF TRUTH BALANCE CALCULATOR
 *
 * Returns a per-currency balance object (e.g. { PHP: 142.85, USDC: 0.0009 }),
 * computed fresh from the ledger every call — never mixes currencies into
 * a single number, since 1 PHP and 1 USDC are not the same unit.
 *
 * IMPORTANT: Add a compound index on your Ledger model for performance:
 *   LedgerSchema.index({ userId: 1, createdAt: -1 });
 * Without it, this query does a full collection scan on every balance check.
 */
export const getUserBalance = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$currency',
        totalCredit: { $sum: { $ifNull: ['$credit', 0] } },
        totalDebit:  { $sum: { $ifNull: ['$debit',  0] } }
      }
    }
  ]);

  const balances = {};
  for (const row of result) {
    const currency = row._id || 'PHP';
    balances[currency] = row.totalCredit - row.totalDebit;
  }

  // Sync per-currency balances back to the wallet document's `balances` map
  // (the object the rest of the app actually reads), not the old mixed
  // singular `balance` field, which is now considered legacy/unused.
  await Wallet.findOneAndUpdate(
    { userId },
    { balances, lastSyncedAt: new Date() },
    { upsert: true }
  );

  return balances;
};
