// src/services/flower/flowerSettlementService.js
// Settles a completed FLOWER → USDC on-chain swap into the user's ledger.
// Writes: FLOWER debit + USDC credit (net of fee) + FeeRecord.

import FlowerOrder    from "../../models/flower/flowerOrderModel.js";
import FeeRecord      from "../../models/feeModel.js";
import { writeEntry } from "../ledgerWriter.js";
import flowerConfig   from "../../../config/flower.js";

const { PLATFORM_FEE } = flowerConfig; // 2%

export async function settle(orderId) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  if (order.status !== "SWAPPED") {
    throw new Error(`Order ${orderId} not in SWAPPED state (current: ${order.status})`);
  }

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
    const usdcReceived  = order.usdcReceived;
    const flowerSwapped = order.receivedAmount;
    const feePercent    = PLATFORM_FEE;
    const feeAmount     = parseFloat((usdcReceived * (feePercent / 100)).toFixed(6));
    const netUsdc       = parseFloat((usdcReceived - feeAmount).toFixed(6));

    console.log(
      `[FlowerSettlement] ${orderId} — ` +
      `${flowerSwapped} FLOWER → ${usdcReceived} USDC → fee ${feeAmount} → net ${netUsdc} USDC credited`
    );

    const meta = {
      flowerSwapped, usdcReceived, feeAmount, netUsdc,
      swapTxHash: order.swapTxHash, chain: order.chain
    };

    // 1. Debit FLOWER
    await writeEntry({
      userId:      order.userId,
      referenceId: orderId + '-flower-debit',
      type:        'flower_swap',
      debit:       flowerSwapped,
      credit:      0,
      currency:    'FLOWER',
      counterparty: order.depositAddress,
      metadata:    meta
    });

    // 2. Credit USDC (net of fee)
    await writeEntry({
      userId:      order.userId,
      referenceId: orderId + '-usdc-credit',
      type:        'flower_swap',
      debit:       0,
      credit:      netUsdc,
      currency:    'USDC',
      counterparty: order.depositAddress,
      metadata:    meta
    });

    // 3. Fee record
    await FeeRecord.create({
      referenceId: orderId + '-fee',
      orderId,
      userId:      order.userId,
      txType:      'flower_swap',
      currency:    'USDC',
      grossAmount: usdcReceived,
      feePercent,
      feeAmount,
      netAmount:   netUsdc,
      chain:       order.chain || 'BASE',
      txHash:      order.swapTxHash,
      metadata:    meta
    });

    // 4. Mark order COMPLETED
    await FlowerOrder.updateOne(
      { orderId },
      { status: 'COMPLETED', feeAmount, usdcReceived: netUsdc }
    );

    console.log(
      `[FlowerSettlement] ${orderId} — COMPLETED. ` +
      `${netUsdc} USDC credited, fee ${feeAmount} USDC recorded`
    );

  } catch (err) {
    console.error(`[FlowerSettlement] ${orderId} — FAILED:`, err.message);
    await FlowerOrder.updateOne({ orderId }, { status: 'FAILED' });
    throw err;
  }
}

export default { settle };
