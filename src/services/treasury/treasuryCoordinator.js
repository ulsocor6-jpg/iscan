import TreasuryAccount from '../../models/treasuryAccountModel.js';
import PhpLiquidityPool from '../../models/phpLiquidityPool.js';
import eventStreamService from '../eventStreamService.js';
import { addAuditLog } from '../auditService.js';
import balanceCache from "../../intelligence/laptop/balanceCache.js";
import balanceHistory from "../../intelligence/laptop/balanceHistory.js";
import treasuryWatcher from "../../intelligence/laptop/treasuryWatcher.js";
import consensusSnapshotService from "../../intelligence/consensus/consensusSnapshotService.js";
import platformIntelligenceBus from "../../intelligence/platform/platformIntelligenceBus.js";

class TreasuryCoordinator {
  /**
   * Called by a watcher (Android, bank connector, blockchain) to report
   * the current physical balance of a specific treasury account.
   */
  async updatePhysicalBalance(accountId, newBalance, source) {
    const before = await TreasuryAccount.findById(accountId);
    const account = await TreasuryAccount.findByIdAndUpdate(accountId, {
      physicalBalance: newBalance,
      lastUpdatedBy: source,
    }, { returnDocument: 'after' });
    if (account) {
      await addAuditLog(null, 'TREASURY_BALANCE_UPDATE', {
        provider: account.provider,
        currency: account.currency,
        before: before?.physicalBalance ?? null,
        after: account.physicalBalance,
        source,
      }, { entity: 'TreasuryAccount', entityId: String(accountId) });
      await this.recalculatePool(account.currency);
      this.emitLiquidityUpdate(account.currency);
    }
    return account;
  }

  /**
   * Atomic delta version of updatePhysicalBalance — for callers crediting an
   * amount (e.g. consensusService after a verified deposit), NOT reporting
   * an absolute live balance. Uses $inc, so two concurrent credits to the
   * same account can't clobber each other the way a read-then-set would.
   */
  async incrementPhysicalBalance(accountId, delta, source) {
    const account = await TreasuryAccount.findByIdAndUpdate(
      accountId,
      { $inc: { physicalBalance: delta }, $set: { lastUpdatedBy: source } },
      { returnDocument: 'after' }
    );
    if (account) {
      await addAuditLog(null, 'TREASURY_BALANCE_UPDATE', {
        provider: account.provider,
        currency: account.currency,
        delta,
        after: account.physicalBalance,
        source,
      }, { entity: 'TreasuryAccount', entityId: String(accountId) });
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
      await addAuditLog(null, 'TREASURY_PENDING_ADJUST', {
        provider: account.provider,
        currency: account.currency,
        deltaIn: deltaIn || 0,
        deltaOut: deltaOut || 0,
        resultingPendingIncoming: account.pendingIncoming,
        resultingPendingOutgoing: account.pendingOutgoing,
      }, { entity: 'TreasuryAccount', entityId: String(accountId) });
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
    await addAuditLog(null, 'TREASURY_RESERVE', {
      provider: account.provider,
      currency: account.currency,
      amount,
      resultingReserved: account.reserved,
    }, { entity: 'TreasuryAccount', entityId: String(accountId) });
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
    await addAuditLog(null, 'TREASURY_RELEASE_RESERVATION', {
      provider: account.provider,
      currency: account.currency,
      amount,
      resultingReserved: account.reserved,
    }, { entity: 'TreasuryAccount', entityId: String(accountId) });
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

    const pool = await PhpLiquidityPool.recalculateFromAccounts(currency);

    const snapshot = treasuryWatcher.update(currency, {
        balance: pool.balance,
        available: pool.balance - pool.reserved,
        reserved: pool.reserved,
        pending: (pool.metadata?.pendingIncoming || 0) - (pool.metadata?.pendingOutgoing || 0),
        expected: pool.balance
    });

    balanceCache.setBalance(currency, snapshot);

    balanceHistory.record(snapshot);

    await platformIntelligenceBus.publish({

        stage: "treasury",

        source: "TreasuryCoordinator",

        type: "TREASURY_UPDATE",

        level: "INFO",

        message: "Treasury pool recalculated.",

        metadata: {
            currency,
            observedBalance: pool.balance,
            reserved: pool.reserved,
            pendingIncoming: pool.metadata?.pendingIncoming || 0,
            pendingOutgoing: pool.metadata?.pendingOutgoing || 0
        }

    });

    return pool;
}

  emitLiquidityUpdate(currency) {
    eventStreamService.emit('treasury.liquidity.updated', { currency });
  }
}

export default new TreasuryCoordinator();
