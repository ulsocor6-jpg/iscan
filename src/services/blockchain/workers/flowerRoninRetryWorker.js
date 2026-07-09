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
  }
}

export default new FlowerRoninRetryWorker();
