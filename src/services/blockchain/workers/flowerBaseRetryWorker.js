// src/services/blockchain/workers/flowerBaseRetryWorker.js
//
// flowerInboxWorker deliberately skips BASE (V2/V3 router mismatch — see
// flowerInboxWorker.js). flowerUsdtSwapService fires sweep+swap once,
// fire-and-forget, when a widget swap is first created — but if that one
// attempt fails (gas, RPC hiccup, etc.), nothing retries it again until an
// admin manually clicks retry in Swap Inspector. This worker is that missing
// automatic retry: it periodically finds BASE orders sitting in a resumable
// state and re-attempts them via the same retryOrder() used by the manual
// button, so most failures self-heal without anyone touching the UI.

import FlowerOrder from "../../../models/flower/flowerOrderModel.js";
import { retryOrder } from "../../flower/flowerOrderRecovery.js";

const RESUMABLE_STATUSES = ["DEPOSIT_RECEIVED", "VERIFIED", "SWAPPED"];
const MIN_AGE_MS = 60 * 1000; // don't race the initial fire-and-forget attempt

class FlowerBaseRetryWorker {
  async process() {
    const cutoff = new Date(Date.now() - MIN_AGE_MS);

    const orders = await FlowerOrder.find({
      chain: "BASE",
      status: { $in: RESUMABLE_STATUSES },
      updatedAt: { $lt: cutoff }
    }).limit(10);

    for (const order of orders) {
      try {
        console.log(`[FlowerBaseRetryWorker] ${order.orderId} — auto-retrying from ${order.status}`);
        await retryOrder(order.orderId, { isAdmin: true });
      } catch (err) {
        console.error(`[FlowerBaseRetryWorker] ${order.orderId} — auto-retry failed:`, err.message);
      }
    }
  }
}

export default new FlowerBaseRetryWorker();
