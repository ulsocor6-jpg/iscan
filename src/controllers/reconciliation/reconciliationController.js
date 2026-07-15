// src/controllers/reconciliation/reconciliationController.js

import CorrectionQueue from '../../models/reconciliation/correctionQueueModel.js';
import { runForUser, runForAllUsers } from '../../services/reconciliation/reconciliationEngine.js';
import { applyCorrection } from '../../services/reconciliation/ledgerCorrectionEngine.js';
import transactionFinalizer from '../../services/reconciliation/transactionFinalizer.js';

// POST /api/v1/admin/reconciliation/run/:userId  { mode?: 'AUTO_CORRECT' | 'DRY_RUN' }
// Backs the dashboard "Run Full Correction" button for a single user.
export async function runForUserHandler(req, res) {
  try {
    const mode = req.body?.mode === 'DRY_RUN' ? 'DRY_RUN' : 'AUTO_CORRECT';
    const result = await runForUser(req.params.userId, { mode });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/v1/admin/reconciliation/run-all  { mode?: 'AUTO_CORRECT' | 'DRY_RUN' }
export async function runForAllUsersHandler(req, res) {
  try {
    const mode = req.body?.mode === 'DRY_RUN' ? 'DRY_RUN' : 'AUTO_CORRECT';
    const result = await runForAllUsers({ mode });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/v1/admin/reconciliation/queue?status=PENDING
export async function listQueueHandler(req, res) {
  try {
    const status = req.query.status || 'PENDING';
    const items = await CorrectionQueue.find({ status }).sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/v1/admin/reconciliation/queue/:id/approve  { note?: string }
export async function approveHandler(req, res) {
  try {
    const proposal = await CorrectionQueue.findById(req.params.id);
    if (!proposal) return res.status(404).json({ success: false, error: 'proposal not found' });
    if (proposal.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: `proposal is ${proposal.status}, not PENDING` });
    }

    proposal.status = 'APPROVED';
    proposal.reviewedBy = req.user?.id ?? req.user?._id ?? null;
    proposal.reviewedAt = new Date();
    proposal.reviewNote = req.body?.note ?? null;
    await proposal.save();

    await transactionFinalizer.recordAudit({
      userId: proposal.userId, currency: proposal.currency, event: 'APPROVED',
      referenceId: proposal.referenceId, runId: proposal.runId,
      detail: { reviewedBy: String(proposal.reviewedBy), note: proposal.reviewNote },
    });

    try {
      const applied = await applyCorrection(proposal);
      proposal.status = 'APPLIED';
      proposal.appliedAt = new Date();
      proposal.appliedLedgerRefs = applied.appliedLedgerRefs || [];
      await proposal.save();
    } catch (err) {
      proposal.status = 'FAILED';
      proposal.failureReason = err.message;
      await proposal.save();
      return res.status(500).json({ success: false, error: `approved but apply failed: ${err.message}`, data: proposal });
    }

    res.json({ success: true, data: proposal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/v1/admin/reconciliation/queue/:id/reject  { note?: string }
export async function rejectHandler(req, res) {
  try {
    const proposal = await CorrectionQueue.findById(req.params.id);
    if (!proposal) return res.status(404).json({ success: false, error: 'proposal not found' });
    if (proposal.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: `proposal is ${proposal.status}, not PENDING` });
    }

    proposal.status = 'REJECTED';
    proposal.reviewedBy = req.user?.id ?? req.user?._id ?? null;
    proposal.reviewedAt = new Date();
    proposal.reviewNote = req.body?.note ?? null;
    await proposal.save();

    await transactionFinalizer.recordAudit({
      userId: proposal.userId, currency: proposal.currency, event: 'REJECTED',
      referenceId: proposal.referenceId, runId: proposal.runId,
      detail: { reviewedBy: String(proposal.reviewedBy), note: proposal.reviewNote },
    });

    res.json({ success: true, data: proposal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
