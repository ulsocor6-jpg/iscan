// src/models/reconciliation/reconciliationAuditModel.js
//
// Persisted, append-only trail of every reconciliation event: clean runs
// (NO_DRIFT), corrections applied, proposals queued/approved/rejected, and
// failures. This is the "Audit Log" + "Compliance: Audit event" boxes from
// the architecture diagram.
//
// Distinct from `inspector` (src/services/blockchain/inspector/...), which
// is a live/ephemeral log stream for the ops dashboard. This model is the
// durable record a compliance review would actually query.

import mongoose from 'mongoose';

const reconciliationAuditSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  currency: { type: String, default: null },

  event: {
    type: String,
    enum: [
      'NO_DRIFT',
      'PROPOSAL_CREATED',
      'AUTO_APPLIED',
      'QUEUED_FOR_REVIEW',
      'APPROVED',
      'REJECTED',
      'APPLIED',
      'APPLY_FAILED',
      'EXPIRED',
    ],
    required: true,
  },

  referenceId: { type: String, default: null, index: true },
  runId:       { type: String, default: null, index: true },

  detail: { type: Object, default: {} },
}, { timestamps: true });

reconciliationAuditSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('ReconciliationAudit', reconciliationAuditSchema);
