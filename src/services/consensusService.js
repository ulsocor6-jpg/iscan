import brainBus from '../brainbus/brainBus.js';
import Channels from '../brainbus/channels.js';
import treasuryIntegrityEngine from '../intelligence/treasuryIntegrityEngine.js';
import DirectDeposit from '../models/DirectDepositModel.js';
import User from '../models/userModel.js';
import walletService from './walletService.js';
import { archiveDeposit } from './depositArchiveService.js';
import eventStreamService from './eventStreamService.js';
import inspectorService from './inspectorService.js';
import { InspectorStage } from '../inspector/inspectorConstants.js';
import incidentEngine from './operator/incidentEngine.js';

class ConsensusService {
  constructor() {
    this.pendingProofs = new Map(); // depositId -> { androidProof, laptopProof }
    brainBus.on(Channels.DEPOSIT_VERIFIED, this.onAndroidProof.bind(this));
    // Laptop proof events come from treasury integrity engine when drift is 0 and proof matches
    brainBus.on(Channels.TREASURY_DRIFT, this.onTreasuryDrift.bind(this));
  }

  onAndroidProof({ flowId, depositId, userId, amount, reference, pool, senderPhone, senderName }) {
    const key = depositId.toString();
    if (!this.pendingProofs.has(key)) {
      this.pendingProofs.set(key, {});
    }
    this.pendingProofs.get(key).android = { flowId, userId, amount, reference, pool, senderPhone, senderName };
    this.checkConsensus(key);
  }

  onTreasuryDrift({ pool, drift, expected, actual, treasuryIncrease, pendingDeposits = [] }) {
    // Per-deposit match: does the amount the pool actually moved by since the
    // last proof equal exactly ONE deposit that's both (a) still pending in
    // the treasury engine's own bookkeeping and (b) already android-verified
    // here? That's the spec's "700 == Pending B" check — not "pool balances
    // overall, so credit everything that has an android proof."
    if (!treasuryIncrease || treasuryIncrease <= 0) return;

    const candidates = pendingDeposits.filter(pd => pd.amount === treasuryIncrease);

    if (candidates.length === 0) {
      // Treasury moved by an amount that doesn't match any known pending
      // deposit. Could be an untracked deposit, a partial/split payment, or
      // drift from something else entirely — don't guess, don't credit.
      console.warn(`[Consensus] Pool ${pool} increased by ${treasuryIncrease} with no matching pending deposit — flagging for review.`);
      incidentEngine.process({
        stage: 'treasury',
        level: 'WARNING',
        metadata: { status: 'UNMATCHED_INCREASE', pool, treasuryIncrease, currency: 'PHP' },
      });
      brainBus.emit(Channels.TREASURY_UNMATCHED_INCREASE, { pool, treasuryIncrease, pendingDeposits });
      return;
    }

    if (candidates.length > 1) {
      // Two+ pending deposits share the exact same amount — amount alone
      // can't disambiguate which one actually arrived. Needs the reference
      // (or manual review) to break the tie; crediting either would be a
      // guess with real money attached.
      console.warn(`[Consensus] Pool ${pool}: ${candidates.length} pending deposits match increase ${treasuryIncrease} — ambiguous, needs reference match or manual review.`);
      incidentEngine.process({
        stage: 'treasury',
        level: 'WARNING',
        metadata: { status: 'AMBIGUOUS_INCREASE', pool, treasuryIncrease, candidateCount: candidates.length, currency: 'PHP' },
      });
      brainBus.emit(Channels.TREASURY_AMBIGUOUS_INCREASE, { pool, treasuryIncrease, candidates });
      return;
    }

    const match = candidates[0];
    const proofs = this.pendingProofs.get(match.depositId?.toString());
    if (!proofs || !proofs.android) {
      // Treasury-side match exists but android hasn't verified this specific
      // deposit yet — don't credit on treasury proof alone. Wait for android.
      return;
    }
    if (proofs.android.reference && match.reference && proofs.android.reference !== match.reference) {
      console.warn(`[Consensus] Deposit ${match.depositId}: android reference ${proofs.android.reference} != treasury reference ${match.reference} — refusing to credit.`);
      return;
    }

    proofs.laptop = { pool, actual, expected, treasuryIncrease };
    this.checkConsensus(match.depositId.toString());
  }

  async checkConsensus(depositId) {
    const proofs = this.pendingProofs.get(depositId);
    if (!proofs || !proofs.android || !proofs.laptop) return;

    console.log(`[Consensus] Deposit ${depositId}: both proofs valid. Authorizing credit.`);
    this.pendingProofs.delete(depositId);

    try {
      // Atomic claim — same guard as before. Whichever path gets there
      // first wins; the other finds status no longer PENDING and backs off
      // instead of crediting twice.
      const claimed = await DirectDeposit.findOneAndUpdate(
        { _id: depositId, status: 'PENDING' },
        { status: 'CREDITED', creditedAt: new Date() },
        { returnDocument: 'after' }
      );

      if (!claimed) {
        console.log(`[Consensus] Deposit ${depositId} already claimed elsewhere — skipping.`);
        return;
      }

      const { flowId, userId, amount, pool, senderPhone, senderName } = proofs.android;

      const wallet = await walletService.credit(userId.toString(), 'PHP', amount, {
        referenceId: claimed.referenceId,
        description: `Consensus-verified deposit ₱${amount} (pool: ${pool}, ref: ${claimed.referenceId})`,
        transactionType: 'cashin',
      });

      await archiveDeposit(claimed, 'CREDITED', { creditedAt: new Date(), senderName, senderPhone });

      // Fold the credited amount into baseBalance and drop it from pending —
      // otherwise removePendingDeposit alone would drag expectedBalance back
      // down by `amount` while actualBalance stays up, creating a permanent
      // phantom drift equal to every deposit ever credited.
      // Atomic $inc — not read-then-write — so two deposits in the same pool
      // crediting close together can't clobber each other's bump.
      await treasuryIntegrityEngine.incrementBaseBalance(pool, amount);
      await treasuryIntegrityEngine.removePendingDeposit(pool, depositId);

      // Physical-balance sync — moved here from processTransaction.js, which
      // no longer credits directly. Same call, same target resolution.
      try {
        const treasuryCoordinator = (await import('../services/treasury/treasuryCoordinator.js')).default;
        const providerMap = { MAYA: 'maya', MARI_BANK: 'maribank', GCASH: 'gcash', BANK: 'maribank' };
        const provider = providerMap[pool] || providerMap[claimed.channel] || 'maya';
        const accounts = await treasuryCoordinator.getLiveState('PHP');
        const target = accounts.find(a => a.provider === provider && a.isActive !== false);
        if (target) {
          await treasuryCoordinator.incrementPhysicalBalance(target.id, amount, 'deposit');
        }
      } catch (treasuryErr) {
        console.error('[Consensus] Treasury physical-balance sync failed:', treasuryErr.message);
      }

      if (flowId) {
        try {
          const user = await User.findById(userId).lean();
          await eventStreamService.emit('deposit.credited', {
            entityId: claimed.referenceId,
            userId: userId.toString(),
            amount,
            channel: claimed.channel,
            sender: senderPhone || senderName || 'unknown',
            userEmail: user?.email || 'unknown',
            userName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'unknown',
          });
          await inspectorService.startStage(flowId, InspectorStage.WALLET, { userId });
          await inspectorService.finishStage(flowId, InspectorStage.WALLET, {
            result: { walletId: wallet?._id, iscanAddress: wallet?.iscanAddress },
            decision: { reason: 'CREDITED_VIA_CONSENSUS' },
          });
          await inspectorService.finishFlow(flowId);
        } catch (flowErr) {
          // Money already moved successfully — don't fail the credit over an
          // audit-trail hiccup, just log it.
          console.error(`[Consensus] Inspector flow finalization failed for ${depositId}:`, flowErr.message);
        }
      }

      console.log(`[Consensus] ✅ ₱${amount} credited to user ${userId} (deposit ${depositId})`);
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
