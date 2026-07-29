#!/usr/bin/env python3
"""
Patch: split the old txHash-keyed operation-dedup system into its own
model, separate from the (correctly working, unrelated) correlation-key
PendingOperation schema it currently collides with.

Background:
  src/models/blockchain/pendingOperationModel.js was redesigned at some
  point into a correlation-key deposit-verification schema:
      operationId, requestId, correlationKey, userId,
      operationType (enum: DEPOSIT/WITHDRAWAL/SWAP),
      expectedAmount (required), expiration (required), ...
  Consumers on this NEW shape (unaffected by this patch, verified via
  their query fields): PhpDepositWatcher.js, OperationCreationService.js,
  VerificationEngine.js, explanationEngine.js.

  Two OTHER files still use the OLD shape this model used to have
  (type, chain, txHash, expectedAddress, token, referenceId, metadata,
  status: OPEN/PROCESSING/COMPLETED/FAILED, retryCount, actualAmount,
  lastError, claimedAt, completedAt, blockchainInboxId, nextOperation):
      - src/services/blockchain/pendingOperationService.js
        (recordPendingOperation / setPendingOperationAmount /
        failPendingOperation — called by treasurySendService.js,
        flowerDexService.js, flowerSwapService.js,
        flowerStageHandlers.js, flowerSwapServiceBase.js)
      - src/services/blockchain/workers/operationCorrelator.js
        (the double-credit-prevention worker — matches confirmed
        on-chain transfers against pending swap/withdrawal operations
        by chain+txHash, claims them, dispatches execution, then
        chains a nextOperation if one is set)

  Since the schema was redesigned to only match the NEW shape, every
  write from the OLD-shape consumers has been silently broken (Mongoose
  strict mode rejects unknown paths on upsert) — this is what surfaced
  as "Path txHash is not in schema" during a PHP->USDC swap, but the
  same failure applies to operationCorrelator.js's double-credit guard.

Fix:
  1. Create a new dedicated model, src/models/blockchain/
     operationTaskModel.js, with the OLD shape (all fields listed
     above), including a unique compound index on {chain, txHash} to
     support the upsert-based dedup, and a 24h TTL index on createdAt
     matching the dedup window this system was originally designed for.
  2. Repoint the two OLD-shape consumers' imports to this new model.
     Their function bodies / query logic do not change at all — only
     the import path. No changes needed to any of the 5 downstream
     callers of pendingOperationService.js's exports, since those
     function signatures are untouched.
  3. src/models/blockchain/pendingOperationModel.js is NOT touched —
     it keeps serving its actual current (correctly working) consumers
     exactly as before.

Usage:
    python3 patch_split_operation_task_model.py [path_to_repo_root]

Defaults to current directory if no path given. Aborts loudly (no
partial writes) if any expected old code isn't found verbatim, or if
the new model file already exists.
"""

import sys
from pathlib import Path

NEW_MODEL_CONTENT = """import mongoose from 'mongoose';

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
"""

def patch_import(path: Path, old_import: str, new_import: str):
    if not path.exists():
        print(f"ABORT: file not found: {path}")
        sys.exit(1)
    content = path.read_text(encoding="utf-8")
    count = content.count(old_import)
    if count == 0:
        print(f"ABORT: expected import line not found verbatim in {path}")
        print(f"  looking for: {old_import.strip()}")
        sys.exit(1)
    if count > 1:
        print(f"ABORT: import line matched {count} times in {path} — expected exactly 1.")
        sys.exit(1)
    backup = path.with_suffix(path.suffix + ".bak.patch_split_operation_task")
    backup.write_text(content, encoding="utf-8")
    path.write_text(content.replace(old_import, new_import), encoding="utf-8")
    print(f"OK: patched {path}")
    print(f"Backup written to {backup}")

def main():
    repo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")

    new_model_path = repo_root / "src" / "models" / "blockchain" / "operationTaskModel.js"
    if new_model_path.exists():
        print(f"ABORT: {new_model_path} already exists — refusing to overwrite.")
        sys.exit(1)
    new_model_path.write_text(NEW_MODEL_CONTENT, encoding="utf-8")
    print(f"OK: created {new_model_path}")

    pending_op_service = repo_root / "src" / "services" / "blockchain" / "pendingOperationService.js"
    patch_import(
        pending_op_service,
        'import PendingOperation from "../../models/blockchain/pendingOperationModel.js";',
        'import PendingOperation from "../../models/blockchain/operationTaskModel.js";',
    )

    correlator = repo_root / "src" / "services" / "blockchain" / "workers" / "operationCorrelator.js"
    patch_import(
        correlator,
        'import PendingOperation from "../../../models/blockchain/pendingOperationModel.js";',
        'import PendingOperation from "../../../models/blockchain/operationTaskModel.js";',
    )

    print()
    print("Next steps:")
    print("  git --no-pager diff")
    print("  git status")
    print("  node --check src/services/blockchain/pendingOperationService.js")
    print("  node --check src/services/blockchain/workers/operationCorrelator.js")
    print("  node --check src/models/blockchain/operationTaskModel.js")
    print()
    print("NOTE: this creates a NEW MongoDB collection (operationtasks).")
    print("Any OLD-shape documents currently sitting in the 'pendingoperations'")
    print("collection (from before this schema got redesigned) will NOT be")
    print("visible via this new model — they were already invisible/broken")
    print("under the current schema too, so nothing that was working stops")
    print("working, but if you want that old data migrated, say so before")
    print("relying on any historical OPEN/PROCESSING records.")

if __name__ == "__main__":
    main()
