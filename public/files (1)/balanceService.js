import Ledger from '../models/ledgerModel.js';
import Wallet from '../models/walletModel.js';

/**
 * SOURCE OF TRUTH BALANCE CALCULATOR
 *
 * Calculates balance by summing all ledger credit/debit entries for a user,
 * then syncs the result back to the wallet document for fast cached reads.
 *
 * IMPORTANT: Add a compound index on your Ledger model for performance:
 *   LedgerSchema.index({ userId: 1, createdAt: -1 });
 * Without it, this query does a full collection scan on every balance check.
 */
export const getUserBalance = async (userId) => {
  // Aggregate in MongoDB — far more efficient than loading all rows into JS
  const result = await Ledger.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: null,
        totalCredit: { $sum: { $ifNull: ['$credit', 0] } },
        totalDebit:  { $sum: { $ifNull: ['$debit',  0] } }
      }
    }
  ]);

  const balance = result.length > 0
    ? result[0].totalCredit - result[0].totalDebit
    : 0;

  // Sync calculated balance back to wallet document so walletModel stays current
  await Wallet.findOneAndUpdate(
    { userId },
    { balance, lastSyncedAt: new Date() },
    { upsert: true } // creates wallet record if somehow missing
  );

  return balance;
};
