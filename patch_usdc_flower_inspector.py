#!/usr/bin/env python3
"""
patch_usdc_flower_inspector.py

Wires USDC->FLOWER reverse-swap orders into the Swap Inspector properly:
  1. flowerUsdtSwapService.js  - extracts the inline success/refund logic
                                  from settleUsdtToFlower into exported
                                  finalizeReverseSwapSuccess/Failure funcs
                                  so retry can reuse them instead of
                                  duplicating credit/refund logic.
  2. flowerOrderRecovery.js    - adds retryUsdcToFlower(), branches
                                  retryOrder() on order.direction so
                                  clicking Retry on a USDC->FLOWER order
                                  no longer runs the FLOWER->USDC pipeline.
  3. SwapInspector.tsx         - row label and expanded detail panel now
                                  render USDC-in -> FLOWER-out correctly
                                  for reverse orders, and the stage tracker
                                  no longer falsely marks DEPOSIT/SWEEP as
                                  "done" for orders that never had a deposit
                                  or sweep step.

Run from repo root: python3 patch_usdc_flower_inspector.py
Then review with: git --no-pager diff
"""
import re
import sys

def patch_file(path, replacements):
    with open(path, "r") as f:
        content = f.read()
    for old, new, label in replacements:
        if old not in content:
            print(f"  [SKIP] {label} — old_str not found in {path}")
            sys.exit(1)
        if content.count(old) > 1:
            print(f"  [WARN] {label} — old_str appears {content.count(old)}x in {path}, expected 1")
        content = content.replace(old, new, 1)
        print(f"  [OK]   {label}")
    with open(path, "w") as f:
        f.write(content)


# ---------------------------------------------------------------------------
# 1. flowerUsdtSwapService.js
# ---------------------------------------------------------------------------
F1 = "src/services/flower/flowerUsdtSwapService.js"
print(f"Patching {F1}")

f1_replacements = [
    (
        '// USDC→FLOWER: debit ledger -> real on-chain swap (treasury capital) ->\n'
        '// credit FLOWER net of fee. Refunds the debit automatically if the swap\n'
        '// fails before anything was broadcast on-chain.\n'
        'export async function settleUsdtToFlower({ userId, amount, chain = "BASE", txRef = uuid() }) {',
        '// Shared finalize handlers for USDC->FLOWER reverse swaps. Used by both\n'
        '// the initial settle flow below AND admin retries in\n'
        '// flowerOrderRecovery.js, so credit/refund logic only lives in one place.\n'
        'export async function finalizeReverseSwapSuccess(orderId, normalizedChain) {\n'
        '  const order        = await FlowerOrder.findOne({ orderId });\n'
        '  const grossFlower  = order.flowerAmountOut;\n'
        '  const feeAmount    = parseFloat((grossFlower * (PLATFORM_FEE / 100)).toFixed(6));\n'
        '  const netFlower    = parseFloat((grossFlower - feeAmount).toFixed(6));\n'
        '\n'
        '  const feeRef = orderId + "-fee";\n'
        '  if (!(await FeeRecord.exists({ referenceId: feeRef }))) {\n'
        '    await walletService.credit(order.userId, "FLOWER", netFlower, {\n'
        '      referenceId: `${orderId}-flower-credit`,\n'
        '      description: `USDC→FLOWER swap credit (${normalizedChain})`,\n'
        '      transactionType: "flower_swap",\n'
        '    });\n'
        '    await FeeRecord.create({\n'
        '      referenceId: feeRef, orderId, userId: order.userId,\n'
        '      txType: "flower_swap", currency: "FLOWER",\n'
        '      grossAmount: grossFlower, feePercent: PLATFORM_FEE, feeAmount, netAmount: netFlower,\n'
        '      chain: normalizedChain, txHash: order.swapTxHash,\n'
        '      metadata: { usdcAmountIn: order.usdcAmountIn, direction: "USDC_TO_FLOWER" },\n'
        '    });\n'
        '  }\n'
        '\n'
        '  await FlowerOrder.updateOne({ orderId }, { status: "COMPLETED" });\n'
        '  console.log(`[FlowerUsdt] ${orderId} — COMPLETED, ${netFlower} FLOWER credited`);\n'
        '}\n'
        '\n'
        '// order must have { orderId, userId, usdcAmountIn } at minimum — either the\n'
        '// freshly-created order object or a reloaded doc from FlowerOrder.findOne.\n'
        'export async function finalizeReverseSwapFailure(order, err) {\n'
        '  const { orderId, userId, usdcAmountIn } = order;\n'
        '  console.error(`[FlowerUsdt] ${orderId} — reverse swap failed: ${err.message}`);\n'
        '\n'
        '  if (err.stage === "post-transfer") {\n'
        '    console.error(`[FlowerUsdt] ${orderId} left in place for manual review — refund NOT auto-issued.`);\n'
        '    return;\n'
        '  }\n'
        '\n'
        '  try {\n'
        '    const result = await FlowerOrder.updateOne(\n'
        '      { orderId, status: { $in: ["SWAPPING"] } },\n'
        '      { status: "FAILED", failureReason: err.message }\n'
        '    );\n'
        '    if (result.modifiedCount > 0) {\n'
        '      await walletService.credit(userId, "USDC", usdcAmountIn, {\n'
        '        referenceId: `${orderId}-usdc-refund`,\n'
        '        description: `USDC→FLOWER swap failed — refund`,\n'
        '        transactionType: "flower_swap_refund",\n'
        '      });\n'
        '      console.log(`[FlowerUsdt] ${orderId} — USDC refunded: ${err.message}`);\n'
        '    }\n'
        '  } catch (refundErr) {\n'
        '    console.error(`[FlowerUsdt] ${orderId} — CRITICAL: refund failed:`, refundErr.message);\n'
        '    // TODO: wire telegramAlertService here — debited, never swapped, refund also failed.\n'
        '  }\n'
        '}\n'
        '\n'
        '// USDC→FLOWER: debit ledger -> real on-chain swap (treasury capital) ->\n'
        '// credit FLOWER net of fee. Refunds the debit automatically if the swap\n'
        '// fails before anything was broadcast on-chain.\n'
        'export async function settleUsdtToFlower({ userId, amount, chain = "BASE", txRef = uuid() }) {',
        "Extract finalizeReverseSwapSuccess/Failure above settleUsdtToFlower",
    ),
    (
        '  executor(orderId)\n'
        '    .then(async () => {\n'
        '      const order = await FlowerOrder.findOne({ orderId });\n'
        '      const grossFlower = order.flowerAmountOut;\n'
        '      const feeAmount   = parseFloat((grossFlower * (PLATFORM_FEE / 100)).toFixed(6));\n'
        '      const netFlower   = parseFloat((grossFlower - feeAmount).toFixed(6));\n'
        '\n'
        '      const feeRef = orderId + "-fee";\n'
        '      if (!(await FeeRecord.exists({ referenceId: feeRef }))) {\n'
        '        await walletService.credit(userId, "FLOWER", netFlower, {\n'
        '          referenceId: `${orderId}-flower-credit`,\n'
        '          description: `USDC→FLOWER swap credit (${normalizedChain})`,\n'
        '          transactionType: "flower_swap",\n'
        '        });\n'
        '        await FeeRecord.create({\n'
        '          referenceId: feeRef, orderId, userId,\n'
        '          txType: "flower_swap", currency: "FLOWER",\n'
        '          grossAmount: grossFlower, feePercent: PLATFORM_FEE, feeAmount, netAmount: netFlower,\n'
        '          chain: normalizedChain, txHash: order.swapTxHash,\n'
        '          metadata: { usdcAmountIn: order.usdcAmountIn, direction: "USDC_TO_FLOWER" },\n'
        '        });\n'
        '      }\n'
        '\n'
        '      await FlowerOrder.updateOne({ orderId }, { status: "COMPLETED" });\n'
        '      console.log(`[FlowerUsdt] ${orderId} — COMPLETED, ${netFlower} FLOWER credited`);\n'
        '    })\n'
        '    .catch(async (err) => {\n'
        '      console.error(`[FlowerUsdt] ${orderId} — reverse swap failed: ${err.message}`);\n'
        '\n'
        '      if (err.stage === "post-transfer") {\n'
        '        console.error(`[FlowerUsdt] ${orderId} left in place for manual review — refund NOT auto-issued.`);\n'
        '        return;\n'
        '      }\n'
        '\n'
        '      try {\n'
        '        const result = await FlowerOrder.updateOne(\n'
        '          { orderId, status: { $in: ["SWAPPING"] } },\n'
        '          { status: "FAILED", failureReason: err.message }\n'
        '        );\n'
        '        if (result.modifiedCount > 0) {\n'
        '          await walletService.credit(userId, "USDC", amount, {\n'
        '            referenceId: `${orderId}-usdc-refund`,\n'
        '            description: `USDC→FLOWER swap failed — refund`,\n'
        '            transactionType: "flower_swap_refund",\n'
        '          });\n'
        '          console.log(`[FlowerUsdt] ${orderId} — USDC refunded: ${err.message}`);\n'
        '        }\n'
        '      } catch (refundErr) {\n'
        '        console.error(`[FlowerUsdt] ${orderId} — CRITICAL: refund failed:`, refundErr.message);\n'
        '        // TODO: wire telegramAlertService here — debited, never swapped, refund also failed.\n'
        '      }\n'
        '    });',
        '  executor(orderId)\n'
        '    .then(() => finalizeReverseSwapSuccess(orderId, normalizedChain))\n'
        '    .catch((err) => finalizeReverseSwapFailure({ orderId, userId, usdcAmountIn: amount }, err));',
        "Replace inline settle .then/.catch with shared finalize calls",
    ),
]
patch_file(F1, f1_replacements)


# ---------------------------------------------------------------------------
# 2. flowerOrderRecovery.js
# ---------------------------------------------------------------------------
F2 = "src/services/flower/flowerOrderRecovery.js"
print(f"\nPatching {F2}")

f2_replacements = [
    (
        'import { sweepFlowerToTreasuryBase } from "./flowerSweepServiceBase.js";\n'
        'import { processSwap as processSwapBase } from "../flowerSwapServiceBase.js";',
        'import { sweepFlowerToTreasuryBase } from "./flowerSweepServiceBase.js";\n'
        'import { processSwap as processSwapBase } from "../flowerSwapServiceBase.js";\n'
        'import {\n'
        '  finalizeReverseSwapSuccess,\n'
        '  finalizeReverseSwapFailure,\n'
        '} from "./flowerUsdtSwapService.js";',
        "Import shared reverse-swap finalize helpers",
    ),
    (
        'export async function retryOrder(orderId, { requesterId, isAdmin = false } = {}) {\n'
        '  const order = await reload(orderId);\n'
        '  if (!order) throw new Error("Order not found");\n'
        '  if (!isAdmin && String(order.userId) !== String(requesterId)) {\n'
        '    throw new Error("Not authorized to retry this order");\n'
        '  }\n'
        '  if (order.status === "COMPLETED") throw new Error("Order already completed");\n'
        '\n'
        '  const chain = String(order.chain).toUpperCase();\n'
        '  if (chain === "BASE") return retryBase(order);\n'
        '  if (chain === "RONIN") return retryRonin(order);\n'
        '  throw new Error(`Retry not implemented for chain "${chain}"`);\n'
        '}',
        '// USDC->FLOWER orders skip deposit/sweep entirely (they start at SWAPPING\n'
        '// off a ledger debit, not an on-chain deposit) so they get their own retry\n'
        '// path rather than falling into retryBase/retryRonin, which assume the\n'
        '// FLOWER_TO_USDC direction and would try to sweep FLOWER that was never\n'
        '// deposited.\n'
        'async function retryUsdcToFlower(order) {\n'
        '  const chain = String(order.chain).toUpperCase();\n'
        '  const executor = chain === "BASE"\n'
        '    ? (await import("../flowerSwapServiceBase.js")).processReverseSwap\n'
        '    : (await import("./flowerSwapService.js")).processReverseSwap;\n'
        '\n'
        '  try {\n'
        '    await executor(order.orderId);\n'
        '    await finalizeReverseSwapSuccess(order.orderId, chain);\n'
        '  } catch (err) {\n'
        '    emitFailure(order, err);\n'
        '    if (err.stage !== "post-transfer") {\n'
        '      await finalizeReverseSwapFailure(order, err);\n'
        '    }\n'
        '    throw err;\n'
        '  }\n'
        '  return reload(order.orderId);\n'
        '}\n'
        '\n'
        'export async function retryOrder(orderId, { requesterId, isAdmin = false } = {}) {\n'
        '  const order = await reload(orderId);\n'
        '  if (!order) throw new Error("Order not found");\n'
        '  if (!isAdmin && String(order.userId) !== String(requesterId)) {\n'
        '    throw new Error("Not authorized to retry this order");\n'
        '  }\n'
        '  if (order.status === "COMPLETED") throw new Error("Order already completed");\n'
        '\n'
        '  if (order.direction === "USDC_TO_FLOWER") return retryUsdcToFlower(order);\n'
        '\n'
        '  const chain = String(order.chain).toUpperCase();\n'
        '  if (chain === "BASE") return retryBase(order);\n'
        '  if (chain === "RONIN") return retryRonin(order);\n'
        '  throw new Error(`Retry not implemented for chain "${chain}"`);\n'
        '}',
        "Branch retryOrder() on direction, add retryUsdcToFlower()",
    ),
]
patch_file(F2, f2_replacements)


# ---------------------------------------------------------------------------
# 3. SwapInspector.tsx
# ---------------------------------------------------------------------------
F3 = "src/pages/SwapInspector.tsx"
print(f"\nPatching {F3}")

f3_replacements = [
    (
        'function stageStatusFor(order: any, stage: string) {\n'
        '  const currentIndex = STAGES.indexOf(STAGE_FOR_STATUS[order.status] || "DEPOSIT");\n'
        '  const stageIndex = STAGES.indexOf(stage);\n'
        '  const isFailed = order.status.startsWith("FAILED");\n'
        '\n'
        '  if (isFailed && stageIndex === currentIndex) return "failed";\n'
        '  if (order.status === "COMPLETED") return "done";\n'
        '  if (stageIndex < currentIndex) return "done";\n'
        '  if (stageIndex === currentIndex && !isFailed) return "active";\n'
        '  return "pending";\n'
        '}',
        '// USDC->FLOWER orders never go through DEPOSIT/SWEEP (they start at\n'
        '// SWAPPING off a ledger debit) so they get a shorter stage list — otherwise\n'
        '// those two stages would falsely render as "done" for a step that never ran.\n'
        'function stagesFor(order: any) {\n'
        '  return order.direction === "USDC_TO_FLOWER" ? ["SWAP", "SETTLE"] : STAGES;\n'
        '}\n'
        '\n'
        'function stageStatusFor(order: any, stage: string) {\n'
        '  const stages = stagesFor(order);\n'
        '  const currentIndex = stages.indexOf(STAGE_FOR_STATUS[order.status] || stages[0]);\n'
        '  const stageIndex = stages.indexOf(stage);\n'
        '  const isFailed = order.status.startsWith("FAILED");\n'
        '\n'
        '  if (isFailed && stageIndex === currentIndex) return "failed";\n'
        '  if (order.status === "COMPLETED") return "done";\n'
        '  if (stageIndex < currentIndex) return "done";\n'
        '  if (stageIndex === currentIndex && !isFailed) return "active";\n'
        '  return "pending";\n'
        '}',
        "Add stagesFor() helper, direction-aware stage indexing",
    ),
    (
        '                      <span style={{ flex: 1, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>\n'
        '                        {order.receivedAmount || order.expectedAmount} FLOWER\n'
        '                        {order.usdcReceived ? ` → ${order.usdcReceived} USDC` : ""}\n'
        '                        {isFailed && order.failureReason && (\n'
        '                          <span style={{ color: "#fca5a5", marginLeft: 8 }}>{order.failureReason}</span>\n'
        '                        )}\n'
        '                      </span>',
        '                      <span style={{ flex: 1, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>\n'
        '                        {order.direction === "USDC_TO_FLOWER" ? (\n'
        '                          <>\n'
        '                            {order.usdcAmountIn} USDC\n'
        '                            {order.flowerAmountOut ? ` → ${order.flowerAmountOut} FLOWER` : ""}\n'
        '                          </>\n'
        '                        ) : (\n'
        '                          <>\n'
        '                            {order.receivedAmount || order.expectedAmount} FLOWER\n'
        '                            {order.usdcReceived ? ` → ${order.usdcReceived} USDC` : ""}\n'
        '                          </>\n'
        '                        )}\n'
        '                        {isFailed && order.failureReason && (\n'
        '                          <span style={{ color: "#fca5a5", marginLeft: 8 }}>{order.failureReason}</span>\n'
        '                        )}\n'
        '                      </span>',
        "Direction-aware row label (USDC-in -> FLOWER-out vs FLOWER-in -> USDC-out)",
    ),
    (
        '                        <div style={{ display: "flex", gap: "20px", marginBottom: "12px", flexWrap: "wrap" }}>\n'
        '                          {STAGES.map((s) => {',
        '                        <div style={{ display: "flex", gap: "20px", marginBottom: "12px", flexWrap: "wrap" }}>\n'
        '                          {stagesFor(order).map((s) => {',
        "Use per-order stage list in expanded stage tracker",
    ),
    (
        '                        <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>\n'
        '                          <div>User: {order.userId}</div>\n'
        '                          <div>Deposit: {shortAddr(order.depositAddress)}</div>\n'
        '                          <div>Source: {order.source}</div>\n'
        '                          <div>Sweep attempts: {order.sweepAttempts ?? 0}</div>\n'
        '                          {order.sweepTxHash && <div>Sweep tx: {shortAddr(order.sweepTxHash)}</div>}\n'
        '                          {order.swapTxHash && <div>Swap tx: {shortAddr(order.swapTxHash)}</div>}\n'
        '                        </div>',
        '                        <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>\n'
        '                          <div>User: {order.userId}</div>\n'
        '                          {order.direction === "USDC_TO_FLOWER" ? (\n'
        '                            <div>USDC in: {order.usdcAmountIn}</div>\n'
        '                          ) : (\n'
        '                            <div>Deposit: {shortAddr(order.depositAddress)}</div>\n'
        '                          )}\n'
        '                          <div>Source: {order.source}</div>\n'
        '                          {order.direction !== "USDC_TO_FLOWER" && (\n'
        '                            <div>Sweep attempts: {order.sweepAttempts ?? 0}</div>\n'
        '                          )}\n'
        '                          {order.sweepTxHash && <div>Sweep tx: {shortAddr(order.sweepTxHash)}</div>}\n'
        '                          {order.swapTxHash && <div>Swap tx: {shortAddr(order.swapTxHash)}</div>}\n'
        '                        </div>',
        "Swap deposit/sweep fields for usdcAmountIn on reverse orders",
    ),
]
patch_file(F3, f3_replacements)

print("\nDone. Review with: git --no-pager diff")
