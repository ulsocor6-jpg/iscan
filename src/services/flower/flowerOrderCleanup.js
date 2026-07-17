// src/services/flower/flowerOrderCleanup.js
//
// Auto-purges FlowerOrders that reached a terminal FAILED state and were
// never acted on. Scoped to status "FAILED" ONLY — FAILED_SWEEP/FAILED_SWAP/
// FAILED_SETTLE are deliberately excluded because flowerOrderGuard.js
// treats those as retryable/active and keeps the deposit address locked to
// them. Purging those out from under a still-retryable order would free
// the address while a later manual retry might still succeed against it.

import FlowerOrder from "../../models/flower/flowerOrderModel.js";
import inspector   from "../blockchain/inspector/blockchainInspector.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TERMINAL_FAILED_STATUSES = ["FAILED"];

export async function purgeFailedOrders({ dryRun = false } = {}) {
  const cutoff = new Date(Date.now() - RETENTION_MS);

  const candidates = await FlowerOrder.find({
    status: { $in: TERMINAL_FAILED_STATUSES },
    updatedAt: { $lt: cutoff },
  }).select("orderId userId updatedAt failureReason");

  if (candidates.length === 0) return { purged: 0, orderIds: [] };

  const orderIds = candidates.map((c) => c.orderId);

  if (dryRun) {
    return { purged: orderIds.length, orderIds, dryRun: true };
  }

  await FlowerOrder.deleteMany({ orderId: { $in: orderIds } });

  inspector.success(
    "FlowerOrderCleanup",
    `Purged ${orderIds.length} failed order(s) untouched for 30+ days`,
    { orderIds }
  );

  return { purged: orderIds.length, orderIds };
}

export default { purgeFailedOrders };
