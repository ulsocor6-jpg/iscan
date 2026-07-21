// src/services/blockchain/workers/flowerStageHandlers.js
//
// Handlers the OperationCorrelator dispatches to for flower-order stages.
// Each handler receives (pending, job) and is responsible for advancing
// the FlowerOrder's stage + recording the REAL on-chain amount involved,
// never the amount that was merely expected/quoted.

import FlowerOrder from "../../../models/flower/flowerOrderModel.js";
import inspector    from "../inspector/blockchainInspector.js";
import brainBus     from "../../../brainbus/brainBus.js";
import { Channels } from "../../../brainbus/channels.js";

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
    // Emit flow start if this is the first stage
    if (!order.currentStage || order.currentStage === "SWEEP") {
        brainBus.emit(Channels.INSPECTOR_FLOW_STARTED, {
            flowId: order.orderId,
            pipeline: "FLOWER_SWAP",
            source: "FLOWER",
            amount: pending.actualAmount || order.expectedAmount,
            currency: "USDC",
            status: "RUNNING",
            stages: []
        }, { source: "FlowerStageHandler", correlationId: order.orderId });
    }
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
    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
        flowId: order.orderId,
        pipeline: "FLOWER_SWAP",
        stage: "FLOWER_SWEEP",
        data: { status: "SUCCESS", txHash: job.txHash, amount: pending.actualAmount }
    }, { source: "FlowerStageHandler", correlationId: order.orderId });
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
    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
        flowId: order.orderId,
        pipeline: "FLOWER_SWAP",
        stage: "FLOWER_SWAP",
        data: { status: "SUCCESS", txHash: job.txHash, amount: pending.actualAmount }
    }, { source: "FlowerStageHandler", correlationId: order.orderId });
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
    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
        flowId: order.orderId,
        pipeline: "FLOWER_SWAP",
        stage: "FLOWER_SETTLE",
        data: { status: "SUCCESS", txHash: job.txHash, amount: pending.actualAmount }
    }, { source: "FlowerStageHandler", correlationId: order.orderId });
        inspector.success("FlowerStage", `SETTLE confirmed for ${order.orderId}`, {
      txHash: job.txHash, amount: pending.actualAmount,
    });
  },

};

export default flowerStageHandlers;
