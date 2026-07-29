// src/services/blockchain/workers/treasuryBalanceRetryWorker.js
//
// Auto-retries USDC->FLOWER orders that failed specifically on a
// transient "Treasury ... balance ... <" read — the RPC-lag race we
// patched in flowerSwapServiceBase.js/flowerSwapService.js. Only targets
// orders where usdcHeld is true (the user's USDC is already swept into
// treasury, so retrying re-attempts the swap without re-debiting anyone).
// Caps attempts so a permanent failure (bad address, no price feed, etc)
// doesn't retry forever.

import FlowerOrder from "../../../models/flower/flowerOrderModel.js";
import { retryOrder } from "../../flower/flowerOrderRecovery.js";

const RUN_INTERVAL_MS = 30 * 1000; // check every 30s
const MAX_AUTO_RETRIES = 5;
let lastRunAt = 0;

class TreasuryBalanceRetryWorker {
  async process() {
    const now = Date.now();
    if (now - lastRunAt < RUN_INTERVAL_MS) return;
    lastRunAt = now;

    try {
      const candidates = await FlowerOrder.find({
        direction: "USDC_TO_FLOWER",
        status: "FAILED",
        usdcHeld: true,
        failureReason: { $regex: /^Treasury (USDC|FLOWER) balance/ },
        swapAttempts: { $lt: MAX_AUTO_RETRIES },
      });

      for (const order of candidates) {
        console.log(`[TreasuryBalanceRetryWorker] auto-retrying ${order.orderId} (attempt ${(order.swapAttempts || 0) + 1}/${MAX_AUTO_RETRIES})`);
        try {
          await retryOrder(order.orderId, { isAdmin: true });
          console.log(`[TreasuryBalanceRetryWorker] ${order.orderId} succeeded on auto-retry`);
        } catch (err) {
          await FlowerOrder.updateOne(
            { orderId: order.orderId },
            { $inc: { swapAttempts: 1 } }
          );
          console.warn(`[TreasuryBalanceRetryWorker] ${order.orderId} auto-retry failed: ${err.message}`);
        }
      }
    } catch (err) {
      console.error("[TreasuryBalanceRetryWorker] error:", err.message);
    }
  }
}

export default new TreasuryBalanceRetryWorker();
