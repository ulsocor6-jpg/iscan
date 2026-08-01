// src/services/blockchain/workers/flowerOrderExpiryWorker.js
//
// Expires FlowerOrders stuck in WAITING_DEPOSIT past their expiresAt
// deadline. Moving status off WAITING_DEPOSIT is sufficient to free the
// deposit address — flowerOrderGuard.js's ACTIVE_STATUSES list does not
// include EXPIRED, so a freshly-expired order stops blocking new orders
// against the same address immediately, no separate unlock step needed.
import FlowerOrder from "../../../models/flower/flowerOrderModel.js";
import inspector from "../inspector/blockchainInspector.js";

class FlowerOrderExpiryWorker {
  async process() {
    const now = new Date();

    const expired = await FlowerOrder.find({
      status: "WAITING_DEPOSIT",
      expiresAt: { $lt: now }
    }).select("orderId userId depositAddress expiresAt");

    if (expired.length === 0) return;

    const orderIds = expired.map((o) => o.orderId);

    await FlowerOrder.updateMany(
      { orderId: { $in: orderIds } },
      { status: "EXPIRED" }
    );

    console.log(
      `[FlowerOrderExpiry] Expired ${orderIds.length} order(s): ${orderIds.join(", ")}`
    );

    inspector.warn(
      "FlowerOrderExpiry",
      `Expired ${orderIds.length} WAITING_DEPOSIT order(s) past deadline`,
      { orderIds }
    );
  }
}

export default new FlowerOrderExpiryWorker();
