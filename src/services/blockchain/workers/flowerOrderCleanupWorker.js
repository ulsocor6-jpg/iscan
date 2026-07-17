// src/services/blockchain/workers/flowerOrderCleanupWorker.js
//
// Registered on the same workScheduler tick as every other worker, but
// self-throttles to once per 24h since a 30-day retention check doesn't
// need to run on every tick.

import { purgeFailedOrders } from "../../flower/flowerOrderCleanup.js";

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastRunAt = 0;

class FlowerOrderCleanupWorker {
  async process() {
    const now = Date.now();
    if (now - lastRunAt < RUN_INTERVAL_MS) return;
    lastRunAt = now;

    try {
      const result = await purgeFailedOrders();
      if (result.purged > 0) {
        console.log(
          `[FlowerOrderCleanupWorker] purged ${result.purged} order(s): ${result.orderIds.join(", ")}`
        );
      }
    } catch (err) {
      console.error("[FlowerOrderCleanupWorker] error:", err.message);
    }
  }
}

export default new FlowerOrderCleanupWorker();
