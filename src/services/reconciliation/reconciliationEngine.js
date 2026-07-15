// src/services/reconciliation/reconciliationEngine.js
//
// The orchestrator behind the "Run Full Correction" button. Wires together
// every box in the architecture diagram, reusing what already exists
// instead of re-implementing it:
//
//   Ledger Scanner + Blockchain Scanner + Balance Comparator
//     -> reconciliationService.reconcileUser() (already built, untouched)
//   Drift Classifier      -> driftClassifier.js
//   Correction Policy Engine -> correctionPolicyEngine.js
//   Correction Queue       -> models/reconciliation/correctionQueueModel.js
//   Ledger Correction Engine + Double Entry Ledger + Transaction Finalizer
//   + Balance Snapshot Rebuilder + Notification Layer
//     -> ledgerCorrectionEngine.js
//
// Note on "Wallet Scanner" from the diagram: in this codebase Wallet.balances
// is a cache that's always fully recomputed from the Ledger on every
// balanceService.getUserBalance() call (Ledger is the sole source of
// truth - see walletService.js history in memory). There's no separate
// "wallet cache vs ledger" drift class to detect here; that box is folded
// into the snapshot rebuild step at the end of a correction.

import { randomUUID } from 'crypto';
import Wallet from '../../models/walletModel.js';
import CorrectionQueue from '../../models/reconciliation/correctionQueueModel.js';
import { reconcileUser } from '../reconciliationService.js';
import { getUserBalance } from '../balanceService.js';
import { classifyDrift } from './driftClassifier.js';
import { evaluateCorrection } from './correctionPolicyEngine.js';
import { applyCorrection } from './ledgerCorrectionEngine.js';
import transactionFinalizer from './transactionFinalizer.js';
import notificationLayer from './notificationLayer.js';

// mode: 'AUTO_CORRECT' applies AUTO_APPROVED proposals immediately.
//       'DRY_RUN' never writes anything - just returns what WOULD happen.
// maxAutoRisk: caps which riskLevel is even eligible for auto-apply,
//   independent of what the policy engine decides. The dashboard's admin
//   "Run Full Correction" button should pass 'RISK_DRIFT' (both allowed,
//   RISK_DRIFT will still land on NEED_APPROVAL via the policy engine's own
//   rules today, but the cap is here as an explicit, auditable choice
//   rather than relying solely on policy internals). The lightweight
//   user-facing refresh flow should pass 'SAFE_DRIFT' as an extra safety
//   net regardless of policy engine changes made in the future.
export async function runForUser(userId, { mode = 'AUTO_CORRECT', maxAutoRisk = 'RISK_DRIFT', runId = randomUUID() } = {}) {
  const report = await reconcileUser(userId);
  if (!report) return { userId: String(userId), found: false };

  const outcomes = [];

  for (const result of report.results) {
    const { riskLevel, reason } = classifyDrift(result);

    if (riskLevel === 'NO_DRIFT') {
      await transactionFinalizer.recordAudit({
        userId, currency: result.currency, event: 'NO_DRIFT', runId, detail: { reason },
      });
      outcomes.push({ currency: result.currency, riskLevel, applied: false, queued: false });
      continue;
    }

    const proposalDoc = {
      userId, currency: result.currency,
      ledgerBalance: result.ledgerBalance, onChainBalance: result.onChainBalance,
      drift: result.drift, direction: result.status, riskLevel, runId, runMode: mode,
    };

    const policy = await evaluateCorrection(proposalDoc);
    // SAFE_DRIFT is always eligible for auto-apply (subject to the policy
    // engine's own decision below). RISK_DRIFT is only eligible if the
    // caller explicitly opted in via maxAutoRisk - the admin "Run Full
    // Correction" flow may do this; the user-facing refresh flow never does.
    const eligibleForAuto = riskLevel === 'SAFE_DRIFT' || maxAutoRisk === 'RISK_DRIFT';

    if (mode === 'DRY_RUN') {
      outcomes.push({
        currency: result.currency, riskLevel, policyDecision: policy.decision,
        policyReasons: policy.reasons, applied: false, queued: false, dryRun: true,
      });
      continue;
    }

    // Persist the proposal first (referenceId doubles as the idempotency
    // key downstream), THEN decide whether to apply it immediately. The
    // referenceId is deterministic from the proposal's own _id, so it's
    // stable whether this gets auto-applied now or approved later.
    const proposal = new CorrectionQueue({
      ...proposalDoc,
      policyDecision: policy.decision,
      policyReasons: policy.reasons,
      status: 'PENDING',
      referenceId: `pending-${randomUUID()}`,
    });
    proposal.referenceId = transactionFinalizer.buildReferenceId(proposal._id);
    await proposal.save();

    await transactionFinalizer.recordAudit({
      userId, currency: result.currency, event: 'PROPOSAL_CREATED', runId,
      referenceId: proposal.referenceId, detail: { riskLevel, drift: result.drift },
    });

    if (policy.decision === 'AUTO_APPROVED' && eligibleForAuto) {
      try {
        const applied = await applyCorrection(proposal);
        proposal.status = 'AUTO_APPLIED';
        proposal.appliedAt = new Date();
        proposal.appliedLedgerRefs = applied.appliedLedgerRefs || [];
        await proposal.save();
        outcomes.push({ currency: result.currency, riskLevel, policyDecision: policy.decision, applied: true, queued: false, proposalId: proposal._id });
      } catch (err) {
        proposal.status = 'FAILED';
        proposal.failureReason = err.message;
        await proposal.save();
        outcomes.push({ currency: result.currency, riskLevel, policyDecision: policy.decision, applied: false, queued: false, error: err.message, proposalId: proposal._id });
      }
    } else {
      await transactionFinalizer.recordAudit({
        userId, currency: result.currency, event: 'QUEUED_FOR_REVIEW', runId,
        referenceId: proposal.referenceId, detail: { riskLevel, policyReasons: policy.reasons },
      });
      await notificationLayer.notifyOperator({
        type: 'correction_needs_review', userId: String(userId), currency: result.currency,
        riskLevel, reasons: policy.reasons, proposalId: String(proposal._id),
      });
      outcomes.push({ currency: result.currency, riskLevel, policyDecision: policy.decision, applied: false, queued: true, proposalId: proposal._id });
    }
  }

  return { userId: String(userId), runId, mode, outcomes };
}

// Sequential across all wallets - same RPC-rate-limit reasoning as the
// existing reconcileAllUsers/correctAllUsersDrift.
export async function runForAllUsers(opts = {}) {
  const runId = opts.runId ?? randomUUID();
  const wallets = await Wallet.find({}, { userId: 1 });
  const results = [];

  for (const w of wallets) {
    try {
      const result = await runForUser(w.userId, { ...opts, runId });
      results.push(result);
    } catch (err) {
      results.push({ userId: String(w.userId), error: err.message });
    }
  }

  return { runId, results };
}

// The "Refresh" flow: sync wallets -> run reconciliation(userId) -> replay
// missing ledger entries -> recompute snapshot -> fetch balance -> return.
//
// This backs the lightweight, user-triggered refresh button (already wired
// to GET /api/v1/dashboard/refresh-balances - see useDashboard.ts), so it
// stays deliberately conservative: only SAFE_DRIFT can auto-apply here no
// matter what the policy engine would otherwise allow. Anything RISK_DRIFT
// always gets queued for admin review, never applied from this path.
//
// "Replay any missing ledger entries" IS the correction step above - a
// chain_ahead_of_ledger drift is, by definition, a deposit/entry the
// pipeline missed; applying that correction is what replays it into the
// ledger. "Recompute snapshot" + "fetch balance" is balanceService.getUserBalance,
// called both inside applyCorrection (if anything was applied) and again
// here to guarantee a fresh read even when nothing needed correcting.
export async function refreshUserSnapshot(userId) {
  const reconciliation = await runForUser(userId, { mode: 'AUTO_CORRECT', maxAutoRisk: 'SAFE_DRIFT' });
  const balances = await getUserBalance(userId);

  return { balances, reconciliation };
}

export default { runForUser, runForAllUsers, refreshUserSnapshot };
