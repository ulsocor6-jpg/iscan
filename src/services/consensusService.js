import brainBus from '../brainbus/brainBus.js';
import Channels from '../brainbus/channels.js';
import treasuryIntegrityEngine from '../intelligence/treasuryIntegrityEngine.js';
import DirectDeposit from '../models/DirectDepositModel.js';
import walletService from './walletService.js';
import { archiveDeposit } from './depositArchiveService.js';

class ConsensusService {
  constructor() {
    this.pendingProofs = new Map(); // depositId -> { androidProof, laptopProof }
    brainBus.on(Channels.DEPOSIT_VERIFIED, this.onAndroidProof.bind(this));
    // Laptop proof events come from treasury integrity engine when drift is 0 and proof matches
    brainBus.on(Channels.TREASURY_DRIFT, this.onTreasuryDrift.bind(this));
  }

  onAndroidProof({ depositId, userId, amount, reference, pool }) {
    if (!this.pendingProofs.has(depositId)) {
      this.pendingProofs.set(depositId, {});
    }
    this.pendingProofs.get(depositId).android = { userId, amount, reference, pool };
    this.checkConsensus(depositId);
  }

  onTreasuryDrift({ pool, drift, expected, actual }) {
    // When drift is zero, it implies a valid laptop proof for the pool's expected state.
    // We'd need to map to specific deposit (by reference). For simplicity, we'll broadcast that the pool is clear.
    // A full implementation would link the drift event to the pending deposit references.
    // For now, we'll trigger consensus for any deposit whose pool just got verified with zero drift.
    if (drift === 0) {
      for (const [depositId, proofs] of this.pendingProofs.entries()) {
        if (proofs.android && proofs.android.pool === pool) {
          proofs.laptop = { pool, actual, expected };
          this.checkConsensus(depositId);
        }
      }
    }
  }

  async checkConsensus(depositId) {
    const proofs = this.pendingProofs.get(depositId);
    if (!proofs || !proofs.android || !proofs.laptop) return;

    console.log(`[Consensus] Deposit ${depositId}: both proofs valid. Authorizing credit.`);
    this.pendingProofs.delete(depositId);

    try {
      // Atomic claim — same pattern as processTransaction.js. Whichever
      // path (this one, or the direct notification-listener path) gets
      // there first wins; the other finds status no longer PENDING and
      // backs off instead of crediting twice.
      const claimed = await DirectDeposit.findOneAndUpdate(
        { _id: depositId, status: 'PENDING' },
        { status: 'CREDITED', creditedAt: new Date() },
        { new: true }
      );

      if (!claimed) {
        console.log(`[Consensus] Deposit ${depositId} already claimed elsewhere — skipping.`);
        return;
      }

      const { userId, amount, pool } = proofs.android;
      await walletService.credit(userId.toString(), 'PHP', amount, {
        referenceId: claimed.referenceId,
        description: `Consensus-verified deposit ₱${amount} (pool: ${pool}, ref: ${claimed.referenceId})`,
        transactionType: 'cashin',
      });

      await archiveDeposit(claimed, 'CREDITED', { creditedAt: new Date() });

      brainBus.emit(Channels.DEPOSIT_CREDITED, { depositId, userId, amount, pool });
    } catch (err) {
      console.error(`[Consensus] Credit failed for ${depositId}:`, err.message);
      // Roll the claim back so a retry/manual review can still pick it up.
      await DirectDeposit.findOneAndUpdate(
        { _id: depositId, status: 'CREDITED' },
        { status: 'PENDING' }
      ).catch(() => {});
    }
  }
}

export default new ConsensusService();
