// src/services/support/investigationService.js
//
// Runs BEFORE any answer is given to a client. Read-only, no side effects —
// calls reconciliationEngine.runForUser() in DRY_RUN mode only, which never
// writes to CorrectionQueue or applies anything. Answers one question:
// "is this user's own account state currently consistent enough to trust
// an automatic answer?"
//
// Reuses existing reconciliation machinery rather than re-implementing
// drift detection:
//   - reconciliationEngine.runForUser(userId, { mode: 'DRY_RUN' })
//   - CorrectionQueue (existing pending proposals — someone may already
//     be mid-review for this user)
//
// SCOPE: currency-level (USDC/USDT) balance consistency only. This does
// NOT detect duplicate individual transactions (e.g. two CO- cashouts of
// the same amount) — no existing function checks that at the
// per-transaction level. Flagging as a known gap, not silently covering it.

import reconciliationEngine from '../reconciliation/reconciliationEngine.js';
import CorrectionQueue from '../../models/reconciliation/correctionQueueModel.js';

export async function investigateUser(userId) {
  const dryRun = await reconciliationEngine.runForUser(userId, { mode: 'DRY_RUN' });
  const pending = await CorrectionQueue.findOne({ userId, status: 'PENDING' }).lean();

  const outcomes = dryRun?.outcomes || [];
  const hasRiskDrift = outcomes.some(o => o.riskLevel === 'RISK_DRIFT');
  const hasSafeDrift = outcomes.some(o => o.riskLevel === 'SAFE_DRIFT');

  let state;
  if (pending || hasRiskDrift) {
    state = 'UNDER_REVIEW';   // never let the client-facing layer guess past this
  } else if (hasSafeDrift) {
    state = 'SELF_HEALING';   // policy engine may auto-apply shortly on its own
  } else {
    state = 'CLEAN';
  }

  return {
    state,
    // Kept for logging/admin visibility ONLY. Never interpolate
    // `outcomes[].policyReasons` into anything shown to a client — those
    // strings are written for engineers (see correctionPolicyEngine.js)
    // and can describe sensitive internal state (e.g. account status).
    detail: { outcomes, pendingProposalId: pending?._id ?? null },
  };
}

export default { investigateUser };
