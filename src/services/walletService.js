import mongoose from 'mongoose';
import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import crypto from 'crypto';
import { deriveUserWallets, SUPPORTED_CHAINS } from './hdWalletService.js';

/**
 * Balance model
 * -------------
 * `Wallet.balances.<asset>` is the ONE authoritative, concurrency-safe
 * balance. It is mutated exclusively through MongoDB atomic
 * findOneAndUpdate calls (a `$gte` guard on debit, a plain `$inc` on
 * credit) - never via "read balance in JS, check in JS, write later".
 * That's what actually closes the double-spend race: the database
 * itself rejects a debit that would make the field go negative, even
 * under concurrent requests, because the guard and the decrement are
 * one indivisible operation on the server.
 *
 * `Ledger` remains the append-only audit trail (who/when/why for every
 * movement) and is written in the SAME database transaction as the
 * balance mutation, so the two can never drift apart - either both
 * happen or neither does.
 *
 * Requires MongoDB to be running as a replica set (Atlas always is;
 * a local standalone mongod is not - see README note in this file's
 * companion migration script if `session.startTransaction()` throws
 * "Transaction numbers are only allowed on a replica set member").
 */

const MAX_TXN_RETRIES = 3;

async function withRetryableTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      try {
        let result;
        await session.withTransaction(async () => {
          result = await fn(session);
        });
        return result;
      } catch (err) {
        const isTransient =
          err?.errorLabels?.includes?.('TransientTransactionError') ||
          err?.errorLabels?.includes?.('UnknownTransactionCommitResult');
        if (isTransient && attempt < MAX_TXN_RETRIES) continue;
        throw err;
      }
    }
  } finally {
    await session.endSession();
  }
}

class WalletService {
  async getOrCreateWallet(userId) {
    let wallet = await Wallet.findOne({ userId });
    if (wallet) return wallet;

    try {
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
    } catch (err) {
      // Two concurrent first-time calls for the same brand-new user can both
      // pass the findOne-null check above and both attempt Wallet.create().
      // The unique index on `userId` makes the loser throw E11000 instead of
      // silently creating a duplicate wallet - recover by just returning the
      // winner's document instead of surfacing a spurious registration error.
      if (err?.code === 11000) {
        const existing = await Wallet.findOne({ userId });
        if (existing) return existing;
      }
      throw err;
    }
  }

  /**
   * Authoritative, race-free balance read. Reads the atomically-maintained
   * cache field directly - no aggregation, no window for a concurrent
   * debit to change the answer between "read" and "use".
   */
  async getBalance(userId, asset = 'USDT') {
    const wallet = await this.getOrCreateWallet(userId);
    const raw = wallet.balances?.get ? wallet.balances.get(asset) : wallet.balances?.[asset];
    return Number(raw || 0);
  }

  /**
   * Recompute an asset's balance straight from the Ledger's own history and
   * compare it against the cached `Wallet.balances` field. Returns any drift
   * found (should always be 0 in normal operation) - intended for
   * reconciliation jobs / admin tooling, not the hot path.
   */
  async reconcileBalance(userId, asset = 'USDT') {
    const [wallet, ledgerResult] = await Promise.all([
      this.getOrCreateWallet(userId),
      Ledger.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId.toString()), currency: asset } },
        { $group: { _id: null, credit: { $sum: { $ifNull: ['$credit', 0] } }, debit: { $sum: { $ifNull: ['$debit', 0] } } } }
      ])
    ]);
    const ledgerBalance = ledgerResult.length
      ? Math.max(0, ledgerResult[0].credit - ledgerResult[0].debit)
      : 0;
    const cachedBalance = Number(
      (wallet.balances?.get ? wallet.balances.get(asset) : wallet.balances?.[asset]) || 0
    );
    return {
      userId: String(userId),
      asset,
      cachedBalance,
      ledgerBalance,
      drift: cachedBalance - ledgerBalance,
      inSync: cachedBalance === ledgerBalance
    };
  }

  // referenceId/description let callers (swap services, etc.) pass
  // meaningful audit context. Falls back to a generated ref if omitted.
  async credit(userId, asset, amount, { referenceId, description, transactionType = 'credit' } = {}) {
    const numericAmount = Number(amount);
    if (!(numericAmount > 0)) throw new Error(`credit amount must be > 0, got ${amount}`);

    await this.getOrCreateWallet(userId); // ensure wallet exists before the transaction

    return withRetryableTransaction(async (session) => {
      const wallet = await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { [`balances.${asset}`]: numericAmount } },
        { new: true, session }
      );
      if (!wallet) throw new Error(`Wallet not found for user ${userId}`);

      await Ledger.create([{
        referenceId: referenceId || ('CREDIT-' + crypto.randomBytes(8).toString('hex')),
        userId,
        transactionType,
        debit: 0,
        credit: numericAmount,
        currency: asset,
        description: description || `${asset} credit via walletService`,
        status: 'completed',
      }], { session });

      return wallet;
    });
  }

  async debit(userId, asset, amount, { referenceId, description, transactionType = 'debit' } = {}) {
    const numericAmount = Number(amount);
    if (!(numericAmount > 0)) throw new Error(`debit amount must be > 0, got ${amount}`);

    await this.getOrCreateWallet(userId); // ensure wallet exists before the transaction

    return withRetryableTransaction(async (session) => {
      // The $gte guard is the entire fix: MongoDB only applies the $inc if a
      // document currently matches the filter, and the filter+update run as
      // one atomic operation server-side. Two concurrent debits for the same
      // user/asset can never both read "sufficient" and both succeed - the
      // second one simply fails to match once the first has landed.
      const wallet = await Wallet.findOneAndUpdate(
        { userId, [`balances.${asset}`]: { $gte: numericAmount } },
        { $inc: { [`balances.${asset}`]: -numericAmount } },
        { new: true, session }
      );

      if (!wallet) {
        // Distinguish "wallet missing" from "insufficient balance" for a
        // clearer error message, without spending an extra round trip in
        // the common (insufficient balance) case.
        const current = await this.getBalance(userId, asset);
        throw new Error(`Insufficient ${asset} balance. Available: ${current}`);
      }

      await Ledger.create([{
        referenceId: referenceId || ('DEBIT-' + crypto.randomBytes(8).toString('hex')),
        userId,
        transactionType,
        debit: numericAmount,
        credit: 0,
        currency: asset,
        description: description || `${asset} debit via walletService`,
        status: 'completed',
      }], { session });

      return wallet;
    });
  }
}

export default new WalletService();
