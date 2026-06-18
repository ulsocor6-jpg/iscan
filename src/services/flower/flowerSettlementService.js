// src/services/flowerSettlementService.js
// Final stage: USDC → PHP conversion + ledger credit to user's PHP wallet.
// Called by flowerSwapService after a successful swap.

import FlowerOrder        from "../../models/flower/flowerOrderModel.js";
import { writeEntry }     from "../ledgerWriter.js";
import { convertToPHP }   from "../fx/fxService.js";
import flowerConfig       from "../../../config/flower.js";

const { PLATFORM_FEE } = flowerConfig; // 2%

// ── Main entry ────────────────────────────────────────────────────────────────
export async function settle(orderId) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  if (order.status !== "SWAPPED") {
    throw new Error(`Order ${orderId} not in SWAPPED state (current: ${order.status})`);
  }

  // Idempotency guard
  const guard = await FlowerOrder.findOneAndUpdate(
    { orderId, status: "SWAPPED" },
    { status: "SETTLING" },
    { new: true }
  );
  if (!guard) {
    console.warn(`[FlowerSettlement] ${orderId} already settling — skipping`);
    return;
  }

  try {
    const usdcReceived = order.usdcReceived;

    // 1. Deduct platform fee (2% of USDC received)
    const feeAmount  = parseFloat((usdcReceived * (PLATFORM_FEE / 100)).toFixed(6));
    const netUsdc    = parseFloat((usdcReceived - feeAmount).toFixed(6));

    // 2. Convert net USDC → PHP
    const { phpAmount, rate } = await convertToPHP(netUsdc, "USDC");

    console.log(
      `[FlowerSettlement] ${orderId} — ` +
      `${usdcReceived} USDC → fee ${feeAmount} → net ${netUsdc} USDC → ₱${phpAmount} (rate: ${rate})`
    );

    // 3. Write ledger entry — credit PHP to user
    await writeEntry({
      userId:      order.userId,
      referenceId: order.orderId,
      type:        "FLOWER_SWAP_CREDIT",
      debit:       0,
      credit:      phpAmount,
      currency:    "PHP",
      counterparty: order.depositAddress,
      metadata: {
        flowReceived:  order.receivedAmount,
        usdcReceived,
        feeAmount,
        netUsdc,
        fxRate:        rate,
        swapTxHash:    order.swapTxHash,
        depositTxHash: order.txHash
      }
    });

    // 4. Mark order COMPLETED
    await FlowerOrder.updateOne(
      { orderId },
      {
        status:     "COMPLETED",
        feeAmount,
        phpAmount
      }
    );

    console.log(`[FlowerSettlement] ${orderId} — COMPLETED. ₱${phpAmount} credited to user ${order.userId}`);

  } catch (err) {
    console.error(`[FlowerSettlement] ${orderId} — settlement FAILED:`, err.message);
    await FlowerOrder.updateOne({ orderId }, { status: "FAILED" });
    throw err;
  }
}

export default { settle };
