import TreasuryState from '../models/TreasuryState.js';
import TreasurySnapshot from '../models/TreasurySnapshot.js';
import brainBus from '../brainbus/brainBus.js';
import Channels from '../brainbus/channels.js';

class TreasuryIntegrityEngine {
  /**
   * Initialize or get existing state for a pool.
   */
  async getOrCreateState(pool) {
    let state = await TreasuryState.findOne({ pool });
    if (!state) {
      state = await TreasuryState.create({ pool });
    }
    return state;
  }

  /**
   * Recalculate expected balance for a pool based on its state document.
   * Expected = baseBalance + Σ(pendingDeposits.amount) - reserved + adjustments
   */
  async recalculateExpected(pool) {
    const state = await this.getOrCreateState(pool);
    const depSum = state.pendingDeposits.reduce((sum, d) => sum + d.amount, 0);
    const expected = state.baseBalance + depSum - state.reserved + state.adjustments;
    state.expectedBalance = expected;
    await state.save();
    return state;
  }

  /**
   * Add a pending deposit to the equation.
   */
  async addPendingDeposit(pool, deposit) {
    const state = await this.getOrCreateState(pool);
    state.pendingDeposits.push({
      depositId: deposit._id,
      reference: deposit.reference,
      amount: deposit.amount,
      user: deposit.userId,
      expectedAt: new Date(Date.now() + 30 * 60 * 1000), // 30m expiry
    });
    await state.save();
    await this.recalculateExpected(pool);
    return state;
  }

  /**
   * Remove a pending deposit (e.g., after credit or expiry).
   */
  async removePendingDeposit(pool, depositId) {
    const state = await this.getOrCreateState(pool);
    state.pendingDeposits = state.pendingDeposits.filter(d => d.depositId.toString() !== depositId.toString());
    await state.save();
    await this.recalculateExpected(pool);
    return state;
  }

  /**
   * Reserve liquidity for a pending withdrawal.
   */
  async addPendingWithdrawal(pool, withdrawal) {
    const state = await this.getOrCreateState(pool);
    state.pendingWithdrawals.push({ withdrawalId: withdrawal._id, amount: withdrawal.amount });
    state.reserved += withdrawal.amount;
    await state.save();
    await this.recalculateExpected(pool);
    return state;
  }

  /**
   * Release reserved liquidity after withdrawal completes/fails.
   */
  async removePendingWithdrawal(pool, withdrawalId, amount) {
    const state = await this.getOrCreateState(pool);
    state.pendingWithdrawals = state.pendingWithdrawals.filter(w => w.withdrawalId.toString() !== withdrawalId.toString());
    state.reserved = Math.max(0, state.reserved - (amount || 0));
    await state.save();
    await this.recalculateExpected(pool);
    return state;
  }

  /**
   * Update base balance (e.g., after manual verification or sweep).
   */
  async setBaseBalance(pool, newBase) {
    const state = await this.getOrCreateState(pool);
    state.baseBalance = newBase;
    await state.save();
    await this.recalculateExpected(pool);
    return state;
  }

  /**
   * Apply manual adjustment (positive or negative).
   */
  async applyAdjustment(pool, amount, reason) {
    const state = await this.getOrCreateState(pool);
    state.adjustments += amount;
    await state.save();
    // Log reason to audit (not shown here)
    await this.recalculateExpected(pool);
    return state;
  }

  /**
   * Process a laptop verifier's signed proof.
   * proof: { pool, actualBalance, timestamp, signature, verifierId }
   */
  async receiveLaptopProof(proof) {
    const state = await this.getOrCreateState(proof.pool);

    // Recalculate expected to be sure it's fresh
    await this.recalculateExpected(proof.pool);

    const drift = proof.actualBalance - state.expectedBalance;
    const integrityScore = this.calculateIntegrityScore(drift, state);

    const snapshot = await TreasurySnapshot.create({
      pool: proof.pool,
      baseBalance: state.baseBalance,
      pendingDeposits: state.pendingDeposits.map(d => ({ depositId: d.depositId, amount: d.amount, reference: d.reference })),
      pendingWithdrawals: state.pendingWithdrawals.map(w => ({ withdrawalId: w.withdrawalId, amount: w.amount })),
      adjustments: state.adjustments,
      expectedBalance: state.expectedBalance,
      actualBalance: proof.actualBalance,
      drift,
      integrityScore,
      proof: { signature: proof.signature, verifierId: proof.verifierId, timestamp: proof.timestamp },
      verifiedAt: new Date(),
    });

    state.lastVerified = new Date();
    state.lastDrift = drift;
    await state.save();

    // Always emit — consensusService needs the drift===0 ("clean proof")
    // case just as much as the mismatch case. Only the *handling* differs
    // downstream, not whether the event fires.
    brainBus.emit(Channels.TREASURY_DRIFT, {
      pool: proof.pool,
      drift,
      expected: state.expectedBalance,
      actual: proof.actualBalance,
    });

    return snapshot;
  }

  /**
   * Basic integrity scoring: 100 if zero drift, decreasing as drift increases.
   */
  calculateIntegrityScore(drift, state) {
    if (drift === 0) return 100;
    const absDrift = Math.abs(drift);
    const total = state.expectedBalance + absDrift;
    const score = total > 0 ? Math.round((1 - absDrift / total) * 100) : 0;
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get latest integrity snapshot for a pool.
   */
  async getLatestSnapshot(pool) {
    return TreasurySnapshot.findOne({ pool }).sort({ createdAt: -1 });
  }
}

export default new TreasuryIntegrityEngine();
