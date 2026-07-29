// src/services/blockchain/workers/flowerRoninRetryWorker.js
//
// Mirrors flowerBaseRetryWorker.js for Ronin. flowerInboxWorker triggers the
// first sweep/swap attempt automatically the moment a deposit confirms, but
// if that attempt fails, nothing retries it again on its own — an admin has
// to open Swap Inspector and click retry manually. This worker closes that
// gap the same way the Base worker does: periodically find Ronin orders
// stuck in a resumable state and re-attempt them automatically.

import FlowerOrder from "../../../models/flower/flowerOrderModel.js";
import { retryOrder } from "../../flower/flowerOrderRecovery.js";

const RESUMABLE_STATUSES = ["DEPOSIT_RECEIVED", "VERIFIED", "SWAPPED"];
const MIN_AGE_MS = 60 * 1000;

// USDC->FLOWER (reverse-swap) orders go straight to FAILED on any swap
// error rather than sitting in a RESUMABLE_STATUSES state, so the query
// below never catches them. A treasury-balance failure specifically is
// transient (RPC read-lag right after the sweep's own tx confirms) and
// usdcHeld:true means the user's USDC is already swept, so retrying here
// is safe and does not re-debit anyone. Capped attempts so a real,
// permanent failure does not retry forever.
const MAX_TREASURY_RETRY_ATTEMPTS = 5;

class FlowerRoninRetryWorker {
  async process() {
    const cutoff = new Date(Date.now() - MIN_AGE_MS);

    const orders = await FlowerOrder.find({
      chain: "RONIN",
      status: { $in: RESUMABLE_STATUSES },
      updatedAt: { $lt: cutoff }
    }).limit(10);

    for (const order of orders) {
      try {
        console.log(`[FlowerRoninRetryWorker] ${order.orderId} — auto-retrying from ${order.status}`);
        await retryOrder(order.orderId, { isAdmin: true });
      } catch (err) {
        console.error(`[FlowerRoninRetryWorker] ${order.orderId} — auto-retry failed:`, err.message);
      }
    }


    const treasuryFailures = await FlowerOrder.find({
      chain: "RONIN",
      direction: "USDC_TO_FLOWER",
      status: "FAILED",
      usdcHeld: true,
      failureReason: { $regex: /^Treasury (USDC|FLOWER) balance/ },
      swapAttempts: { $lt: MAX_TREASURY_RETRY_ATTEMPTS },
      updatedAt: { $lt: cutoff }
    }).limit(10);
    for (const order of treasuryFailures) {
      console.log("[FlowerRoninRetryWorker] " + order.orderId + " auto-retrying transient treasury-balance failure");
      try {
        await retryOrder(order.orderId, { isAdmin: true });
      } catch (err) {
        await FlowerOrder.updateOne(
          { orderId: order.orderId },
          { $inc: { swapAttempts: 1 } }
        );
        console.error("[FlowerRoninRetryWorker] " + order.orderId + " treasury-balance auto-retry failed: " + err.message);
      }
    }
    }
}

export default new FlowerRoninRetryWorker();
