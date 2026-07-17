// src/services/blockchain/workers/flowerDepositWatcher.js
//
// Handles the ONE stage that is NOT system-initiated: DEPOSIT.
// There is no txHash to pre-register (the user broadcasts it, not us), so
// this is matched by watched deposit address rather than by
// PendingOperation. Runs as its own correlator pass, separate from
// OperationCorrelator's txHash-based claim logic.

import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import FlowerOrder     from "../../../models/flower/flowerOrderModel.js";
import inspector       from "../inspector/blockchainInspector.js";

class FlowerDepositWatcher {

  async process() {
    const jobs = await BlockchainInbox.find({
      status: "CONFIRMED",
      "workers.flowerDeposit.done": { $ne: true },
    });

    for (const job of jobs) {
      try {
        await this.processJob(job);
      } catch (err) {
        inspector.error("FlowerDepositWatcher", err.message, { txHash: job.txHash });
      }
    }
  }

  async processJob(job) {
    const order = await FlowerOrder.findOne({
      depositAddress: (job.toAddress || "").toLowerCase(),
      chain: (job.chain || "").toLowerCase(),
      stage: "AWAITING_DEPOSIT",
    });

    if (!order) {
      // Not a tracked flower deposit address — leave untouched, other
      // workers (depositProcessor etc.) still get to look at it.
      return;
    }

    // Source of truth: the REAL amount that landed, not any prior
    // quote/expectation. This is what SWEEP validates against later,
    // closing the gap that caused "refusing to sweep a short amount"
    // to fire against a stale expected value.
    order.deposit = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: job.amount,
      confirmedAt: new Date(),
    };
    order.expectedAmount = job.amount; // <-- single source of truth from here on
    order.stage = "SWEEP_PENDING";
    await order.save();

    await BlockchainInbox.updateOne(
      { _id: job._id },
      { $set: {
          "workers.flowerDeposit.done": true,
          "workers.flowerDeposit.updatedAt": new Date(),
      } }
    );

    inspector.success("FlowerDepositWatcher",
      `DEPOSIT confirmed for ${order.orderId}`,
      { chain: job.chain, txHash: job.txHash, amount: job.amount }
    );
  }
}

export default new FlowerDepositWatcher();
