import TreasuryAccount from '../../models/treasuryAccountModel.js';
import TransactionReservation from '../../models/transactionReservationModel.js';
import Wallet from '../../models/walletModel.js';
import treasuryCoordinator from './treasuryCoordinator.js';
import crypto from 'crypto';

class AllocationEngine {
  /**
   * Attempt to allocate a specific amount from the best treasury account
   * of the given provider for a withdrawal.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.provider   - 'gcash', 'maya', 'bank_bpi', etc.
   * @param {number} params.amount     - amount to lock
   * @param {string} params.currency   - usually 'PHP'
   * @param {number} [params.ttlMinutes=15] - how long the reservation lasts
   * @returns {{ account, reservation }} on success
   * @throws Will throw if no account can fulfil the request
   */
  async allocate({ userId, provider, amount, currency = 'PHP', ttlMinutes = 15 }) {
    // 0. Resolve the user's wallet — TransactionReservation requires
    // walletId, and every user has exactly one Wallet document (userId
    // is unique on that model), covering all currencies via its
    // `balances` map. This was previously never looked up, which made
    // every reservation.create() call fail schema validation.
    const walletDoc = await Wallet.findOne({ userId });
    if (!walletDoc) {
      throw new Error(`No wallet found for user ${userId}`);
    }

    // 1. Find all active accounts for this provider, sorted by highest available
    const accounts = await treasuryCoordinator.getLiveState(currency);
    const candidates = accounts
      .filter(a => a.provider === provider && a.available >= amount)
      .sort((a, b) => b.available - a.available); // best first

    if (candidates.length === 0) {
      throw new Error(
        `No ${provider} treasury account has sufficient available liquidity for a ${amount} ${currency} withdrawal`
      );
    }

    const bestAccount = candidates[0];

    // 2. Atomic reservation on the TreasuryAccount (decrements available)
    try {
      await treasuryCoordinator.reserve(bestAccount.id, amount);
    } catch (err) {
      throw new Error(`Failed to reserve funds: ${err.message}`);
    }

    // 3. Create a corresponding TransactionReservation for tracking
    const reservationId = `RES-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    let reservation;
    try {
      reservation = await TransactionReservation.create({
        reservationId,
        userId,
        walletId: walletDoc._id,
        referenceId: reservationId, // will be updated with the withdrawal's referenceId later
        currency,
        amount,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
        metadata: {
          treasuryAccountId: bestAccount.id,
          provider,
        },
      });
    } catch (reservationErr) {
      // The treasury account was already decremented in step 2 — if the
      // reservation record fails to save, that liquidity would otherwise
      // be stuck as "reserved" with nothing tracking it. Release it back
      // before propagating the error.
      await treasuryCoordinator.releaseReservation(bestAccount.id, amount).catch(() => {});
      throw new Error(`Failed to create transaction reservation: ${reservationErr.message}`);
    }

    return {
      account: bestAccount,
      reservation,
    };
  }

  /**
   * Release a reservation (e.g. withdrawal expired, cancelled, or failed).
   */
  async release(reservationId) {
    const res = await TransactionReservation.findOne({ reservationId, status: 'ACTIVE' });
    if (!res) return false;

    const accountId = res.metadata?.treasuryAccountId;
    if (accountId) {
      await treasuryCoordinator.releaseReservation(accountId, res.amount);
    }

    res.status = 'RELEASED';
    await res.save();
    return true;
  }

  /**
   * Mark a reservation as consumed (withdrawal successfully sent).
   */
  async consume(reservationId) {
    const res = await TransactionReservation.findOne({ reservationId, status: 'ACTIVE' });
    if (!res) return false;
    res.status = 'CONSUMED';
    await res.save();
    return true;
  }
}

export default new AllocationEngine();
