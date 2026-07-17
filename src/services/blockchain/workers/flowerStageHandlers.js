// src/services/blockchain/workers/flowerStageHandlers.js
//
// Handlers the OperationCorrelator dispatches to for flower-order stages.
// Each handler receives (pending, job) and is responsible for advancing
// the FlowerOrder's stage + recording the REAL on-chain amount involved,
// never the amount that was merely expected/quoted.

import FlowerOrder from "../../../models/flower/flowerOrderModel.js";
import inspector    from "../inspector/blockchainInspector.js";

async function loadOrder(referenceId) {
  const order = await FlowerOrder.findOne({ orderId: referenceId });
  if (!order) {
    throw new Error(`FlowerOrder ${referenceId} not found for pending op`);
  }
  return order;
}

export const flowerStageHandlers = {

  async FLOWER_SWEEP(pending, job) {
    const order = await loadOrder(pending.referenceId);
    // actualAmount must be attached by the sweep service when it calls
    // recordPendingOperation() — read back here rather than trusting the
    // order's pre-existing "expected" field.
    order.sweep = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.currentStage = "SWAP";
    await order.save();
    inspector.success("FlowerStage", `SWEEP confirmed for ${order.orderId}`, {
      txHash: job.txHash, amount: pending.actualAmount,
    });
  },

  async FLOWER_SWAP(pending, job) {
    const order = await loadOrder(pending.referenceId);
    order.swap = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.currentStage = "SETTLE";
    await order.save();
    inspector.success("FlowerStage", `SWAP confirmed for ${order.orderId}`, {
      txHash: job.txHash, amount: pending.actualAmount,
    });
  },

  async FLOWER_REVERSE_SWAP(pending, job) {
    const order = await loadOrder(pending.referenceId);
    order.swap = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    // finalizeReverseSwapSuccess() in flowerUsdtSwapService.js separately
    // flips order.status -> COMPLETED once the FLOWER credit + FeeRecord
    // land. Only touch currentStage here, never status.
    order.currentStage = "SETTLE";
    await order.save();
    inspector.success("FlowerStage", `REVERSE_SWAP confirmed for ${order.orderId}`, {
      txHash: job.txHash, amount: pending.actualAmount,
    });
  },

  async FLOWER_SETTLE(pending, job) {
    const order = await loadOrder(pending.referenceId);
    order.settle = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.currentStage = "SETTLE";
    order.status = "COMPLETED";
    await order.save();
    inspector.success("FlowerStage", `SETTLE confirmed for ${order.orderId}`, {
      txHash: job.txHash, amount: pending.actualAmount,
    });
  },

};

export default flowerStageHandlers;
