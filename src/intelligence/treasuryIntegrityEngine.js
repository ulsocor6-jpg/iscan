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
   * Atomic $push — safe under concurrent calls for the SAME pool from
   * DIFFERENT users. (Same-user double-submit is already blocked upstream
   * by the one-deposit-per-user guardrail; this protects against a surge of
   * different users hitting the same pool at once, which that guardrail
   * doesn't cover.)
   */
  async addPendingDeposit(pool, deposit) {
    await TreasuryState.findOneAndUpdate(
      { pool },
      {
        $push: {
          pendingDeposits: {
            depositId: deposit._id,
            reference: deposit.reference,
            amount: deposit.amount,
            user: deposit.userId,
            expectedAt: new Date(Date.now() + 30 * 60 * 1000), // 30m expiry
          },
        },
      },
      { new: true, upsert: true }
    );
    return this.recalculateExpected(pool);
  }

  /**
   * Remove a pending deposit (e.g., after credit or expiry). Atomic $pull.
   */
  async removePendingDeposit(pool, depositId) {
    await TreasuryState.findOneAndUpdate(
      { pool },
      { $pull: { pendingDeposits: { depositId } } },
      { new: true, upsert: true }
    );
    return this.recalculateExpected(pool);
  }

  /**
   * Reserve liquidity for a pending withdrawal. Atomic $push + $inc in one
   * update, so a concurrent withdrawal can't observe reserved incremented
   * without the array entry present (or vice versa).
   */
  async addPendingWithdrawal(pool, withdrawal) {
    await TreasuryState.findOneAndUpdate(
      { pool },
      {
        $push: { pendingWithdrawals: { withdrawalId: withdrawal._id, amount: withdrawal.amount } },
        $inc: { reserved: withdrawal.amount },
      },
      { new: true, upsert: true }
    );
    return this.recalculateExpected(pool);
  }

  /**
   * Release reserved liquidity after withdrawal completes/fails.
   * Atomic $pull + $inc(-amount). NOTE: unlike the old code this no longer
   * clamps reserved at 0 server-side (Mongo can't do Math.max in a plain
   * $inc) — callers must pass the correct amount. If that's a concern, this
   * needs an aggregation-pipeline update instead; flagging rather than
   * guessing at syntax I can't verify against your Mongo version.
   */
  async removePendingWithdrawal(pool, withdrawalId, amount) {
    await TreasuryState.findOneAndUpdate(
      { pool },
      {
        $pull: { pendingWithdrawals: { withdrawalId } },
        $inc: { reserved: -(amount || 0) },
      },
      { new: true, upsert: true }
    );
    return this.recalculateExpected(pool);
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
   * Atomically increment baseBalance — safe for concurrent calls on the same
   * pool (e.g. two deposits crediting close together). Unlike setBaseBalance,
   * this does not read-then-write, so it can't lose a concurrent increment.
   */
  async incrementBaseBalance(pool, amount) {
    const state = await TreasuryState.findOneAndUpdate(
      { pool },
      { $inc: { baseBalance: amount } },
      { new: true, upsert: true }
    );
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

    // How much did the pool actually move since the last time we read it?
    // This is what lets consensus match the movement to ONE specific pending
    // deposit (spec's "700 == Pending B" check) instead of waiting for the
    // whole pool's pending sum to clear before crediting anything.
    // NOTE: requires a `lastKnownActual: Number` field on TreasuryState —
    // add it to the schema if it isn't there yet.
    const baseline = state.lastKnownActual ?? state.baseBalance;
    const treasuryIncrease = proof.actualBalance - baseline;

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
    state.lastKnownActual = proof.actualBalance;
    await state.save();

    // Always emit — consensusService needs the drift===0 ("clean proof")
    // case just as much as the mismatch case. Only the *handling* differs
    // downstream, not whether the event fires.
    //
    // pendingDeposits + treasuryIncrease are included so consensus can match
    // the movement to a specific deposit (reference/depositId), instead of
    // crediting every android-proofed deposit in the pool once the pool-wide
    // drift happens to hit zero.
    brainBus.emit(Channels.TREASURY_DRIFT, {
      pool: proof.pool,
      drift,
      expected: state.expectedBalance,
      actual: proof.actualBalance,
      treasuryIncrease,
      pendingDeposits: state.pendingDeposits.map(d => ({
        depositId: d.depositId,
        reference: d.reference,
        amount: d.amount,
      })),
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
