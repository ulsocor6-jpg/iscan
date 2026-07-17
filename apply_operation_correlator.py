#!/usr/bin/env python3
"""
Adds the Operation Correlator pipeline stage: PendingOperation model,
correlator worker, bootstrap registration, and integration into
sendStablecoinToUser (closes an already-live double-credit risk, not just
a future one).

Run from repo root: python3 apply_operation_correlator.py
Then: git --no-pager diff
"""

def patch(filepath, old, new, expected_count=1):
    with open(filepath, "r") as f:
        content = f.read()
    count = content.count(old)
    if count != expected_count:
        print(f"❌ {filepath}: expected {expected_count} match(es), found {count}. Skipping.")
        return False
    content = content.replace(old, new, expected_count)
    with open(filepath, "w") as f:
        f.write(content)
    print(f"✅ {filepath}: patched")
    return True

def write_new(filepath, content):
    import os
    if os.path.exists(filepath):
        print(f"❌ {filepath}: already exists, not overwriting. Delete it first if you want to re-apply.")
        return False
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w") as f:
        f.write(content)
    print(f"✅ {filepath}: created")
    return True

results = []

# ─────────────────────────────────────────────────────────────────────────
# 1. New file: PendingOperation model
# ─────────────────────────────────────────────────────────────────────────
results.append(write_new(
    "src/models/blockchain/pendingOperationModel.js",
    '''import mongoose from "mongoose";

// Generic — not swap-specific. Any on-chain send/swap this system itself
// initiates and needs to recognize when it lands, so the generic deposit
// pipeline (depositProcessor, flowerInboxWorker) doesn't mistake it for a
// fresh external deposit and double-process it.
const PendingOperationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["SWAP", "WITHDRAWAL", "INTERNAL_TRANSFER", "OTHER"],
      index: true,
    },

    chain: {
      type: String,
      required: true,
      index: true,
    },

    // The exact broadcast tx hash. Must be written BEFORE tx.wait()
    // resolves, so this record exists in the DB before the confirming
    // blockchain event can possibly be picked up by BlockchainEngine.
    txHash: {
      type: String,
      required: true,
      index: true,
    },

    // Informational only — the correlator matches on chain+txHash alone,
    // never on this field.
    expectedAddress: {
      type: String,
      default: null,
    },

    token: {
      type: String,
      default: null,
    },

    // Free-form link back to whatever domain record this belongs to
    // (FlowerOrder.orderId, a withdrawal _id, etc.) — plain string since
    // `type` above already tells you which collection to check.
    referenceId: {
      type: String,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["OPEN", "CLAIMED", "EXPIRED"],
      default: "OPEN",
      index: true,
    },

    claimedAt: {
      type: Date,
      default: null,
    },

    blockchainInboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlockchainInbox",
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Auto-cleanup for tx hashes that never confirmed (dropped/replaced
    // tx, RPC hiccup, etc.) — mirrors BlockchainInbox's own expireAt/TTL
    // pattern. 24h is generous; normal confirmation takes seconds.
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

// One pending operation per chain+txHash.
PendingOperationSchema.index({ chain: 1, txHash: 1 }, { unique: true });

export default mongoose.model("PendingOperation", PendingOperationSchema);
'''
))

# ─────────────────────────────────────────────────────────────────────────
# 2. New file: recordPendingOperation helper
# ─────────────────────────────────────────────────────────────────────────
results.append(write_new(
    "src/services/blockchain/pendingOperationService.js",
    '''import PendingOperation from "../../models/blockchain/pendingOperationModel.js";

/**
 * Call the moment you have a signed tx hash — BEFORE tx.wait() — for any
 * on-chain send/swap this system itself initiates to a watched address.
 * This is what lets the Operation Correlator recognize the confirming
 * event later and keep depositProcessor / flowerInboxWorker from
 * mistaking it for a fresh external deposit.
 */
export async function recordPendingOperation({
  type,
  chain,
  txHash,
  expectedAddress = null,
  token = null,
  referenceId = null,
  metadata = {},
}) {
  if (!type || !chain || !txHash) {
    throw new Error("recordPendingOperation requires type, chain, and txHash");
  }

  return PendingOperation.findOneAndUpdate(
    { chain: chain.toLowerCase(), txHash },
    {
      $setOnInsert: {
        type,
        chain: chain.toLowerCase(),
        txHash,
        expectedAddress: expectedAddress ? expectedAddress.toLowerCase() : null,
        token,
        referenceId,
        status: "OPEN",
        metadata,
      },
    },
    { new: true, upsert: true }
  );
}

export default { recordPendingOperation };
'''
))

# ─────────────────────────────────────────────────────────────────────────
# 3. New file: operationCorrelator worker
# ─────────────────────────────────────────────────────────────────────────
results.append(write_new(
    "src/services/blockchain/workers/operationCorrelator.js",
    '''import BlockchainInbox   from "../../../models/blockchain/blockchainInboxModel.js";
import PendingOperation  from "../../../models/blockchain/pendingOperationModel.js";
import inspector         from "../inspector/blockchainInspector.js";

class OperationCorrelator {

  async process() {

    const jobs = await BlockchainInbox.find({
      status: "CONFIRMED",
      "workers.correlator.done": false
    });

    for (const job of jobs) {
      try {
        await this.processJob(job);
      } catch (err) {
        inspector.error("OperationCorrelator", err.message, { txHash: job.txHash });
      }
    }

  }

  async processJob(job) {

    // Match ONLY on chain + txHash — exact, unambiguous. No amount
    // tolerance, no address heuristics. Whatever broadcasts the tx is
    // responsible for calling recordPendingOperation() with this exact
    // hash before tx.wait() resolves.
    const pending = await PendingOperation.findOne({
      chain: (job.chain || "").toLowerCase(),
      txHash: job.txHash,
      status: "OPEN"
    });

    if (!pending) {
      // Not a tracked internal operation — leave everything else on this
      // job untouched. Falls through to depositProcessor / flowerInboxWorker
      // exactly as it does today.
      await BlockchainInbox.updateOne(
        { _id: job._id },
        { $set: {
            "workers.correlator.done": true,
            "workers.correlator.updatedAt": new Date()
        } }
      );
      return;
    }

    // Claim it — this is our own internal operation's confirmation, not a
    // fresh external deposit. Mark deposit + flower done too, since those
    // are the two workers confirmed to act on any confirmed watched-address
    // transfer with no "was this expected" check of their own.
    await BlockchainInbox.updateOne(
      { _id: job._id },
      { $set: {
          "workers.correlator.done": true,
          "workers.correlator.updatedAt": new Date(),
          "workers.deposit.done": true,
          "workers.deposit.updatedAt": new Date(),
          "workers.flower.done": true,
          "workers.flower.updatedAt": new Date(),
          currentStage: `${pending.type}_CORRELATED`
      } }
    );

    const claimed = await PendingOperation.findOneAndUpdate(
      { _id: pending._id, status: "OPEN" },
      { status: "CLAIMED", claimedAt: new Date(), blockchainInboxId: job._id },
      { new: true }
    );

    if (claimed) {
      inspector.success(
        "OperationCorrelator",
        `Claimed ${pending.type} — ${job.chain} ${job.txHash} (ref: ${pending.referenceId ?? "n/a"})`,
        { chain: job.chain, txHash: job.txHash, type: pending.type, referenceId: pending.referenceId }
      );
    }
    // claimed === null means another tick already claimed this
    // PendingOperation between our findOne and findOneAndUpdate — the
    // BlockchainInbox flags above are already set regardless, so this is
    // safe to just skip without erroring.

  }

}

export default new OperationCorrelator();
'''
))

# ─────────────────────────────────────────────────────────────────────────
# 4. blockchainInboxModel.js — add `correlator` to WorkerSchema map
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "src/models/blockchain/blockchainInboxModel.js",
    '''      dashboard: {
        type: WorkerSchema,
        default: () => ({})
      }

    },''',
    '''      dashboard: {
        type: WorkerSchema,
        default: () => ({})
      },

      correlator: {
        type: WorkerSchema,
        default: () => ({})
      }

    },'''
))

# ─────────────────────────────────────────────────────────────────────────
# 5. blockchainInbox.js — add correlator to the $setOnInsert default workers
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "src/services/blockchain/journal/blockchainInbox.js",
    '''                    workers: event.workers ?? {
                        deposit: {},
                        flower: {},
                        treasury: {},
                        settlement: {},
                        wallet: {},
                        ledger: {},
                        dashboard: {}
                    }''',
    '''                    workers: event.workers ?? {
                        deposit: {},
                        flower: {},
                        treasury: {},
                        settlement: {},
                        wallet: {},
                        ledger: {},
                        dashboard: {},
                        correlator: {}
                    }'''
))

# ─────────────────────────────────────────────────────────────────────────
# 6. bootstrap.js — register correlator right after confirmationWorker,
#    before depositProcessor. Sequential scheduler => order = safety.
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "src/services/blockchain/bootstrap.js",
    '''import recoveryWorker from "./workers/recoveryWorker.js";
import confirmationWorker from "./workers/confirmationWorker.js";
import depositProcessor from "./workers/depositProcessor.js";''',
    '''import recoveryWorker from "./workers/recoveryWorker.js";
import confirmationWorker from "./workers/confirmationWorker.js";
import operationCorrelator from "./workers/operationCorrelator.js";
import depositProcessor from "./workers/depositProcessor.js";'''
))

results.append(patch(
    "src/services/blockchain/bootstrap.js",
    '''        workScheduler.register(
            confirmationWorker
        );

        workScheduler.register(
            depositProcessor
        );''',
    '''        workScheduler.register(
            confirmationWorker
        );

        // Must run before depositProcessor / flowerInboxWorker: claims any
        // confirmed event that matches a PendingOperation we wrote ourselves
        // before broadcasting, so those two don't mistake our own internal
        // sends/swaps for fresh external deposits. Sequential scheduler ==
        // this ordering is the actual safety guarantee, not a suggestion.
        workScheduler.register(
            operationCorrelator
        );

        workScheduler.register(
            depositProcessor
        );'''
))

# ─────────────────────────────────────────────────────────────────────────
# 7. treasurySendService.js — close the ALREADY-LIVE risk in
#    sendStablecoinToUser (sends real USDC to a watched internal address)
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "src/services/treasury/treasurySendService.js",
    '''import inspector from "../blockchain/inspector/blockchainInspector.js";
import { withTreasuryLock } from "./treasurySendQueue.js";''',
    '''import inspector from "../blockchain/inspector/blockchainInspector.js";
import { withTreasuryLock } from "./treasurySendQueue.js";
import { recordPendingOperation } from "../blockchain/pendingOperationService.js";'''
))

results.append(patch(
    "src/services/treasury/treasurySendService.js",
    '''    const tx = await token.transfer(toAddress, amountWei);
    return tx.wait();
  });

  console.log(
    `[Treasury] ✅ Sent ${amount} ${currency} → ${toAddress} | tx: ${receipt.hash} (ref: ${txRef})`
  );''',
    '''    const tx = await token.transfer(toAddress, amountWei);

    // Written BEFORE tx.wait() — this send goes to the user's own watched
    // Base address, so without this the confirming transfer would look
    // identical to a fresh external deposit to depositProcessor and could
    // get double-credited.
    await recordPendingOperation({
      type: "INTERNAL_TRANSFER",
      chain: "BASE",
      txHash: tx.hash,
      expectedAddress: toAddress,
      token: currency,
      referenceId: txRef,
    });

    return tx.wait();
  });

  console.log(
    `[Treasury] ✅ Sent ${amount} ${currency} → ${toAddress} | tx: ${receipt.hash} (ref: ${txRef})`
  );'''
))

print()
ok = sum(1 for r in results if r)
print(f"{ok}/{len(results)} steps applied.")
if ok != len(results):
    print("⚠️  Some steps were skipped — paste the affected file(s) back to me.")
else:
    print("All clean. Now run:")
    print("  node --check src/models/blockchain/pendingOperationModel.js")
    print("  node --check src/services/blockchain/pendingOperationService.js")
    print("  node --check src/services/blockchain/workers/operationCorrelator.js")
    print("  node --check src/services/blockchain/bootstrap.js")
    print("  node --check src/services/treasury/treasurySendService.js")
    print("  git --no-pager diff")
