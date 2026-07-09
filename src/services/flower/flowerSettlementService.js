// src/services/flower/flowerSettlementService.js
// Settles a completed FLOWER → USDC on-chain swap into the user's ledger.
// Writes: FLOWER debit + USDC credit (net of fee) + FeeRecord.
//
// IDEMPOTENCY: each of the three writes below is guarded by an existence
// check on its deterministic referenceId before creating. This makes
// settle() safe to call more than once for the same order — a prerequisite
// once retries are possible, since FeeRecord.referenceId is a unique index
// and a raw retry without these guards would either throw E11000 on the
// fee record, or (worse, since Ledger.referenceId is NOT unique) silently
// double-credit the user's ledger on the first two writes before that.
//
// FAILURE HANDLING: on error we intentionally do NOT force the order to
// FAILED anymore. A failure here means settlement didn't finish — but the
// on-chain swap already succeeded (real usdcReceived, real swapTxHash).
// Leaving the order at SETTLING keeps it honestly "not done yet" and
// retriable, instead of permanently mislabeling a funded swap as FAILED.

import FlowerOrder    from "../../models/flower/flowerOrderModel.js";
import FeeRecord      from "../../models/feeModel.js";
import Ledger         from "../../models/ledgerModel.js";
import { writeEntry } from "../ledgerWriter.js";
import flowerConfig   from "../../../config/flower.js";

const { PLATFORM_FEE } = flowerConfig; // 2%

export async function settle(orderId) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  // Already fully settled — nothing to do. Makes retries/duplicate calls safe.
  if (order.status === "COMPLETED") {
    console.warn(`[FlowerSettlement] ${orderId} already COMPLETED — skipping`);
    return;
  }

  if (!["SWAPPED", "SETTLING"].includes(order.status)) {
    throw new Error(`Order ${orderId} not in SWAPPED/SETTLING state (current: ${order.status})`);
  }

  // Atomic guard for the SWAPPED -> SETTLING transition. If this order is
  // already SETTLING (e.g. a prior attempt died partway through settlement),
  // `guard` will be null here — that's fine, we proceed using `order` as-is
  // and rely on the per-write existence checks below to resume safely.
  await FlowerOrder.findOneAndUpdate(
    { orderId, status: "SWAPPED" },
    { status: "SETTLING" },
    { new: true }
  );

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

    // 1. Debit FLOWER (idempotent)
    const flowerDebitRef = orderId + '-flower-debit';
    if (!(await Ledger.exists({ referenceId: flowerDebitRef }))) {
      await writeEntry({
        userId:      order.userId,
        referenceId: flowerDebitRef,
        type:        'flower_swap',
        debit:       flowerSwapped,
        credit:      0,
        currency:    'FLOWER',
        counterparty: order.depositAddress,
        metadata:    meta
      });
    } else {
      console.warn(`[FlowerSettlement] ${orderId} — flower-debit ledger entry already exists, skipping`);
    }

    // 2. Credit USDC net of fee (idempotent)
    const usdcCreditRef = orderId + '-usdc-credit';
    if (!(await Ledger.exists({ referenceId: usdcCreditRef }))) {
      await writeEntry({
        userId:      order.userId,
        referenceId: usdcCreditRef,
        type:        'flower_swap',
        debit:       0,
        credit:      netUsdc,
        currency:    'USDC',
        counterparty: order.depositAddress,
        metadata:    meta
      });
    } else {
      console.warn(`[FlowerSettlement] ${orderId} — usdc-credit ledger entry already exists, skipping`);
    }

    // 3. Fee record (idempotent — this one has a unique index and is what
    // previously threw E11000 on any retry)
    const feeRef = orderId + '-fee';
    if (!(await FeeRecord.exists({ referenceId: feeRef }))) {
      await FeeRecord.create({
        referenceId: feeRef,
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
    } else {
      console.warn(`[FlowerSettlement] ${orderId} — fee record already exists, skipping`);
    }

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
    console.error(`[FlowerSettlement] ${orderId} — settlement step failed, leaving at SETTLING for retry:`, err.message);
    // Deliberately NOT setting status to FAILED here — see file header note.
    throw err;
  }
}

export default { settle };
