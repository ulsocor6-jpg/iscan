import TreasuryAccount from '../../models/treasuryAccountModel.js';
import PhpLiquidityPool from '../../models/phpLiquidityPool.js';
import eventStreamService from '../eventStreamService.js';

class TreasuryCoordinator {
  /**
   * Called by a watcher (Android, bank connector, blockchain) to report
   * the current physical balance of a specific treasury account.
   */
  async updatePhysicalBalance(accountId, newBalance, source) {
    const account = await TreasuryAccount.findByIdAndUpdate(accountId, {
      physicalBalance: newBalance,
      lastUpdatedBy: source,
    }, { returnDocument: 'after' });
    if (account) {
      await this.recalculatePool(account.currency);
      this.emitLiquidityUpdate(account.currency);
    }
    return account;
  }

  /** Adjust pending incoming/outgoing (e.g. when a transfer is initiated/completed). */
  async adjustPending(accountId, deltaIn, deltaOut) {
    const update = {};
    if (deltaIn) update.pendingIncoming = deltaIn;
    if (deltaOut) update.pendingOutgoing = deltaOut;
    const account = await TreasuryAccount.findByIdAndUpdate(accountId, { $inc: update }, { returnDocument: 'after' });
    if (account) {
      await this.recalculatePool(account.currency);
      this.emitLiquidityUpdate(account.currency);
    }
    return account;
  }

  /** Reserve an amount on a specific account (for a withdrawal). */
  async reserve(accountId, amount) {
    const account = await TreasuryAccount.findOneAndUpdate(
      { _id: accountId, isActive: true, $expr: { $gte: [{ $subtract: ['$physicalBalance', '$reserved'] }, amount] } },
      { $inc: { reserved: amount } },
      { returnDocument: 'after' }
    );
    if (!account) throw new Error('Insufficient available liquidity or account not found');
    await this.recalculatePool(account.currency);
    this.emitLiquidityUpdate(account.currency);
    return account;
  }

  /** Release a reservation (e.g. withdrawal expired or failed). */
  async releaseReservation(accountId, amount) {
    const account = await TreasuryAccount.findByIdAndUpdate(accountId,
      { $inc: { reserved: -amount } },
      { returnDocument: 'after' }
    );
    await this.recalculatePool(account.currency);
    this.emitLiquidityUpdate(account.currency);
    return account;
  }

  /**
   * Get the full state of every active account, including computed `available`.
   * This is what the Liquidity Engine and frontend consume.
   */
  async getLiveState(currency = 'PHP') {
    const accounts = await TreasuryAccount.find({ currency, isActive: true }).lean();
    return accounts.map(acc => ({
      id: acc._id,
      provider: acc.provider,
      label: acc.accountLabel,
      physicalBalance: acc.physicalBalance,
      reserved: acc.reserved,
      pendingIncoming: acc.pendingIncoming,
      pendingOutgoing: acc.pendingOutgoing,
      safetyReserve: acc.safetyReserve,
      available: acc.physicalBalance + acc.pendingIncoming - acc.reserved - acc.pendingOutgoing - acc.safetyReserve,
    }));
  }

  async recalculatePool(currency) {
    await PhpLiquidityPool.recalculateFromAccounts(currency);
  }

  emitLiquidityUpdate(currency) {
    eventStreamService.emit('treasury.liquidity.updated', { currency });
  }
}

export default new TreasuryCoordinator();
