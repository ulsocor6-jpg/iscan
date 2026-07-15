// src/models/reconciliation/correctionQueueModel.js
//
// Persisted correction PROPOSALS produced by the Drift Classifier +
// Correction Policy Engine (see src/services/reconciliation/*).
//
// One document per (userId, currency, drift-detection-run). Status moves:
//   PENDING            -> newly queued, awaiting admin decision (NEED_APPROVAL)
//   AUTO_APPLIED        -> policy engine approved it, ledgerCorrectionEngine applied it immediately
//   APPROVED -> APPLIED -> admin approved a PENDING item, then it was applied
//   REJECTED            -> admin rejected, never applied
//   FAILED              -> approved/auto-approved but ledgerCorrectionEngine threw
//   EXPIRED              -> left PENDING too long (see withdrawalExpiryService pattern), needs re-run
//
// `referenceId` is the idempotency key used everywhere downstream (Ledger
// entries, notifications). It's the proposal's own _id-derived string, not
// a Date.now() value, so re-running reconciliation against an
// already-queued or already-applied drift never double-applies it.

import mongoose from 'mongoose';

const correctionQueueSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  currency: { type: String, required: true },

  // Snapshot of the numbers that produced this proposal, for audit purposes.
  // The live values may have moved on by the time this is reviewed/applied -
  // that's fine, ledgerCorrectionEngine re-derives the amount to apply from
  // THESE frozen values, not from a fresh reconcile, so what the admin
  // approves is exactly what gets applied.
  ledgerBalance:  { type: Number, required: true },
  onChainBalance: { type: Number, required: true },
  drift:          { type: Number, required: true },
  direction: {
    type: String,
    enum: ['ledger_ahead_of_chain', 'chain_ahead_of_ledger'],
    required: true,
  },

  riskLevel: {
    type: String,
    enum: ['SAFE_DRIFT', 'RISK_DRIFT'],
    required: true,
  },

  policyDecision: {
    type: String,
    enum: ['AUTO_APPROVED', 'NEED_APPROVAL'],
    required: true,
  },
  policyReasons: { type: [String], default: [] },

  status: {
    type: String,
    enum: ['PENDING', 'AUTO_APPLIED', 'APPROVED', 'APPLIED', 'REJECTED', 'FAILED', 'EXPIRED'],
    default: 'PENDING',
    index: true,
  },

  referenceId: { type: String, required: true, unique: true },

  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: null },

  appliedAt:          { type: Date, default: null },
  appliedLedgerRefs:  { type: [String], default: [] }, // referenceIds of the actual Ledger rows written
  failureReason:      { type: String, default: null },

  // Run that produced this proposal, useful for grouping in the dashboard
  // ("Run Full Correction" button click -> one runId -> N proposals).
  runId: { type: String, index: true },
  runMode: { type: String, enum: ['AUTO_CORRECT', 'DRY_RUN'], default: 'AUTO_CORRECT' },
}, { timestamps: true });

correctionQueueSchema.index({ userId: 1, currency: 1, status: 1 });

export default mongoose.model('CorrectionQueue', correctionQueueSchema);
