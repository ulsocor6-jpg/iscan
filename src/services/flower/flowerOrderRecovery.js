// src/services/flower/flowerOrderRecovery.js
//
// Manual retry entry point for stuck FlowerOrders, used by both the admin
// SwapInspector and the client-facing failure popup. Branches per chain
// because Ronin and Base do NOT share an implementation yet:
//   RONIN -> EvmV2DexAdapter (Katana, V2-style) -- live, matches flowerInboxWorker
//   BASE  -> flowerSweepServiceBase / flowerSwapServiceBase (Uniswap V3) -- live,
//            matches flowerUsdtSwapService. Do NOT route Base through the
//            adapter; its router assumption (V2) doesn't match the real
//            Base router (confirmed Uniswap V3 SwapRouter02).

import FlowerOrder      from "../../models/flower/flowerOrderModel.js";
import DepositAddress   from "../../models/depositAddressModel.js";
import { getAdapter }   from "../../../adapters/index.js";
import inspector        from "../blockchain/inspector/blockchainInspector.js";

import { sweepFlowerToTreasuryBase } from "./flowerSweepServiceBase.js";
import { processSwap as processSwapBase } from "../flowerSwapServiceBase.js";

async function reload(orderId) {
  return FlowerOrder.findOne({ orderId });
}

function emitFailure(order, err) {
  inspector.error("swap", err.message, {
    orderId: order.orderId,
    userId: String(order.userId),
    chain: order.chain,
    failureReason: err.message
  });
}

const MAX_AUTO_ATTEMPTS = 5;

async function retryBase(order) {
  try {
    if (order.status === "DEPOSIT_RECEIVED") {
      await sweepFlowerToTreasuryBase(order.orderId);
    }
    const reloaded = await reload(order.orderId);
    if (["VERIFIED", "DEPOSIT_RECEIVED"].includes(reloaded.status)) {
      await processSwapBase(order.orderId);
    }
  } catch (err) {
    emitFailure(order, err);
    // A post-transfer sweep failure may have already broadcast a tx —
    // never auto-fail that case, same rule flowerUsdtSwapService follows.
    if (err.stage !== "post-transfer") {
      const attempts = (order.sweepAttempts || 0) + (order.swapAttempts || 0) + 1;
      const maxed = attempts >= MAX_AUTO_ATTEMPTS;
      await FlowerOrder.updateOne(
        { orderId: order.orderId, status: { $ne: "COMPLETED" } },
        {
          status: maxed ? "FAILED" : order.status,
          failureReason: err.message,
          $inc: { sweepAttempts: 1 }
        }
      );
    }
    throw err;
  }
  return reload(order.orderId);
}

async function retryRonin(order) {
  const adapter = getAdapter("RONIN");
  const depositRecord = await DepositAddress.findOne({
    address: order.depositAddress.toLowerCase(),
    chain: "RONIN"
  });
  if (!depositRecord || depositRecord.hdIndex == null) {
    throw new Error(`No HD index found for address ${order.depositAddress}`);
  }

  try {
    if (order.status === "DEPOSIT_RECEIVED") {
      const derived = await adapter.deriveDepositAddress(depositRecord.hdIndex);
      const sweepResult = await adapter.sweepToTreasury({
        depositAddress: order.depositAddress,
        privateKey: derived.privateKey,
        expectedAmount: order.receivedAmount
      });
      await FlowerOrder.updateOne(
        { orderId: order.orderId },
        { status: "VERIFIED", sweepTxHash: sweepResult.txHash }
      );
      inspector.success("swap", "Swept to treasury", { orderId: order.orderId, txHash: sweepResult.txHash });
    }

    const reloaded = await reload(order.orderId);
    if (reloaded.status === "VERIFIED") {
      const quote = await adapter.getQuote(reloaded.receivedAmount);
      const minOutputRaw = adapter.calcMinOutput(quote.amountOutRaw);
      const receipt = await adapter.executeSwap({
        amountInWei: quote.amountInWei,
        minOutputRaw,
        path: quote.path
      });
      const usdcReceived = adapter.parseQuoteAmountFromReceipt(receipt);
      await FlowerOrder.updateOne(
        { orderId: order.orderId },
        { status: "SWAPPED", swapTxHash: receipt.hash, usdcReceived }
      );
      inspector.success("swap", "Swap executed", { orderId: order.orderId, usdcReceived, txHash: receipt.hash });
    }
  } catch (err) {
    emitFailure(order, err);
    const attempts = (order.sweepAttempts || 0) + (order.swapAttempts || 0) + 1;
    const maxed = attempts >= MAX_AUTO_ATTEMPTS;
    await FlowerOrder.updateOne(
      { orderId: order.orderId, status: { $ne: "COMPLETED" } },
      {
        status: maxed ? "FAILED" : order.status,
        failureReason: err.message,
        $inc: { sweepAttempts: 1 }
      }
    );
    throw err;
  }
  return reload(order.orderId);
}

export async function retryOrder(orderId, { requesterId, isAdmin = false } = {}) {
  const order = await reload(orderId);
  if (!order) throw new Error("Order not found");
  if (!isAdmin && String(order.userId) !== String(requesterId)) {
    throw new Error("Not authorized to retry this order");
  }
  if (order.status === "COMPLETED") throw new Error("Order already completed");

  const chain = String(order.chain).toUpperCase();
  if (chain === "BASE") return retryBase(order);
  if (chain === "RONIN") return retryRonin(order);
  throw new Error(`Retry not implemented for chain "${chain}"`);
}

export default { retryOrder };
