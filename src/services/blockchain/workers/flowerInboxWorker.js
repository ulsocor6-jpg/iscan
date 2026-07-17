// src/services/blockchain/workers/flowerInboxWorker.js
//
// Reads confirmed FLOWER transfer events from BlockchainInbox and hands
// the order off to flowerOrderRecovery, which owns the sweep -> swap ->
// settle chain and all of its error/retry bookkeeping. This worker's only
// job now is: find the deposit, match it to a pending order, mark it
// received, then delegate.

import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import FlowerOrder      from "../../../models/flower/flowerOrderModel.js";
import { retryOrder } from "../../flower/flowerOrderRecovery.js";

const AMOUNT_TOLERANCE_PCT = 0.01; // 1% — matches old watcher's tolerance

class FlowerInboxWorker {
  async process() {
    const jobs = await BlockchainInbox.find({
      token: "FLOWER",
      status: "CONFIRMED",
      "workers.flower.done": { $ne: true }
    }).limit(20);

    for (const job of jobs) {
      try {
        await this.handleOne(job);
      } catch (err) {
        console.error(`[FlowerInboxWorker] ${job.txHash} — error:`, err.message);
        await BlockchainInbox.findByIdAndUpdate(job._id, {
          $set: {
            "workers.flower.error": err.message,
            "workers.flower.updatedAt": new Date()
          }
        });
      }
    }
  }

  async handleOne(job) {
    const depositAddress = job.to;

    // NOTE: BASE used to be skipped here over a V2/V3 router mismatch
    // concern. That concern applies to routing sweep/swap through
    // EvmV2DexAdapter — but retryOrder() -> retryBase() never uses that
    // adapter; it calls sweepFlowerToTreasuryBase/processSwapBase (real
    // Uniswap V3) directly. This worker only detects the deposit and
    // delegates to retryOrder, which already branches correctly per
    // chain. The skip was stale and has been removed.

    const order = await FlowerOrder.findOne({
      depositAddress: new RegExp(`^${depositAddress}$`, "i"),
      status: { $in: ["WAITING_DEPOSIT", "CREATED"] }
      // source filter removed — GENERIC and USDT_WIDGET orders both need
      // real on-chain deposit verification before sweep/swap runs.
    });

    if (!order) {
      console.warn(
        `[FlowerInboxWorker] ${job.txHash} — no matching pending order for ${depositAddress}, flagging and skipping`
      );
      await BlockchainInbox.findByIdAndUpdate(job._id, {
        $set: {
          "workers.flower.error": "No matching pending FlowerOrder",
          "workers.flower.updatedAt": new Date()
        }
      });
      return;
    }

    const amount = parseFloat(job.value) / (10 ** (job.decimals ?? 18));
    const tolerance = order.expectedAmount * AMOUNT_TOLERANCE_PCT;
    if (Math.abs(amount - order.expectedAmount) > tolerance) {
      console.warn(
        `[FlowerInboxWorker] ${order.orderId} — amount mismatch: got ${amount}, expected ${order.expectedAmount}, skipping`
      );
      return;
    }

    console.log(`[FlowerInboxWorker] ${order.orderId} — deposit confirmed: ${amount} FLOWER (tx: ${job.txHash})`);

    await FlowerOrder.updateOne(
      { orderId: order.orderId },
      {
        status: "DEPOSIT_RECEIVED",
        txHash: job.txHash,
        receivedAmount: amount,
        currentStage: "DEPOSIT"
      }
    );

    await retryOrder(order.orderId, { isAdmin: true }); // worker runs as system, bypasses ownership check

    await BlockchainInbox.findByIdAndUpdate(job._id, {
      $set: {
        "workers.flower.done": true,
        "workers.flower.updatedAt": new Date(),
        currentStage: "DashboardWorker"
      }
    });
  }
}

export default new FlowerInboxWorker();
