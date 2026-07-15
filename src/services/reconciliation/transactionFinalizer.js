// src/services/reconciliation/transactionFinalizer.js
//
// Two jobs, both about making corrections safe to retry:
//   1. Reference generation - a deterministic referenceId derived from the
//      CorrectionQueue proposal's own _id, NOT Date.now(). Re-running
//      reconciliation, retrying a failed apply, or a duplicate admin click
//      all resolve to the SAME referenceId.
//   2. Idempotency check - before ledgerCorrectionEngine writes anything,
//      confirm no Ledger row with that referenceId already exists.
//
// Also writes to ReconciliationAudit - the durable trail behind the
// "Audit Log" / "Compliance: Audit event" boxes in the diagram.

import Ledger from '../../models/ledgerModel.js';
import ReconciliationAudit from '../../models/reconciliation/reconciliationAuditModel.js';

export function buildReferenceId(proposalId) {
  return `recon-correction-${proposalId}`;
}

// Returns true if this correction has already been written to the ledger -
// i.e. it is safe to skip re-applying.
export async function alreadyApplied(referenceId) {
  const existing = await Ledger.findOne({ referenceId }, { _id: 1 });
  return !!existing;
}

export async function recordAudit({ userId, currency, event, referenceId, runId, detail }) {
  try {
    await ReconciliationAudit.create({ userId, currency, event, referenceId, runId, detail });
  } catch (err) {
    // Audit logging must never block the actual financial operation - log
    // and move on. If this repeatedly fails, it'll show up in inspector.
    // eslint-disable-next-line no-console
    console.error('[reconciliation] failed to write audit entry:', err.message);
  }
}

export default { buildReferenceId, alreadyApplied, recordAudit };
