import mongoose from 'mongoose';

// OperationTask — the OLD "PendingOperation" shape, split out into its
// own model because src/models/blockchain/pendingOperationModel.js was
// redesigned into an unrelated correlation-key deposit-verification
// schema (operationId/correlationKey/expectedAmount/expiration) that
// broke this one silently. This model exists purely to keep the
// original txHash-keyed dedup + operation-chaining system working:
//   - pendingOperationService.js (recordPendingOperation /
//     setPendingOperationAmount / failPendingOperation)
//   - operationCorrelator.js (double-credit-prevention worker: matches
//     confirmed on-chain transfers to pending swap/withdrawal
//     operations by chain+txHash, claims them, dispatches execution,
//     and chains a nextOperation if one is set)
//
// Do not add fields here for the correlation-key deposit-verification
// use case — that belongs in pendingOperationModel.js instead.

const OperationTaskSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // e.g. SWAP / WITHDRAWAL / INTERNAL_TRANSFER / OTHER
    chain: { type: String, required: true }, // stored lowercase by callers
    txHash: { type: String, required: true },
    expectedAddress: { type: String, default: null },
    token: { type: String, default: null },
    referenceId: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['OPEN', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'OPEN',
    },
    retryCount: { type: Number, default: 0 },
    actualAmount: { type: Number, default: null },
    lastError: { type: String, default: null },
    claimedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    blockchainInboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BlockchainInbox',
      default: null,
    },
    nextOperation: { type: String, default: null },
  },
  { timestamps: true }
);

// Supports the upsert-based dedup in recordPendingOperation().
OperationTaskSchema.index({ chain: 1, txHash: 1 }, { unique: true });

// 24h TTL — matches this system's original dedup-window design.
OperationTaskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.model('OperationTask', OperationTaskSchema);
