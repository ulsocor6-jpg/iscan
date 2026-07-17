#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Concern: Live watcher stream for USDC->FLOWER reverse swaps.

Root cause: processSwap() (FLOWER->USDC) already calls inspector.info/
success/error(...) at each real step, which inspectorBridge.js forwards
to eventStreamService -> the existing admin SSE stream
(/api/v1/admin/dashboard/stream). processReverseSwap() (USDC->FLOWER) and
its ledger debit/credit/refund handlers in flowerUsdtSwapService.js never
call inspector at all, so that direction is silent until it fails.

This patch:
  1. Adds inspector.info/success/error calls at each real step of the
     USDC->FLOWER pipeline: order created (debit confirmed), treasury
     balance check, router approval, Katana/UniV3 quote, tx broadcast,
     tx confirmed, ledger credit (success), and refund / manual-review
     (failure) -- mirroring the granularity already used on the forward
     (FLOWER->USDC) path, plus the extra balance/quote/approval detail
     you asked for.
  2. Updates SwapInspector.tsx to:
       - open an EventSource on /api/v1/admin/dashboard/stream
       - filter for type === "blockchain.swap", group by data.orderId
       - render a live scrolling log inside the expanded order row
       - poll /flower-orders every 30s while any order is non-terminal,
         and back off to a 12h idle poll otherwise (was a flat 5s poll)

Run from ~/Desktop/iscansystem:
    python3 patch_usdc_flower_live_stream.py

Then review:
    git --no-pager diff

Then commit and remove this script + the .bak files it created.
"""

import sys
import time
from pathlib import Path

ROOT = Path(".").resolve()
STAMP = int(time.time())


def apply_patch(rel_path: str, replacements: list[tuple[str, str]]) -> None:
    path = ROOT / rel_path
    if not path.exists():
        print(f"[SKIP] {rel_path} not found at {path}")
        sys.exit(1)

    content = path.read_text(encoding="utf-8")
    original = content

    for i, (old, new) in enumerate(replacements, start=1):
        count = content.count(old)
        if count != 1:
            print(f"[FAIL] {rel_path}: replacement #{i} matched {count} times (expected 1).")
            print("---- snippet ----")
            print(old[:300])
            print("-----------------")
            sys.exit(1)
        content = content.replace(old, new, 1)

    backup = path.with_suffix(path.suffix + f".bak.{STAMP}")
    backup.write_text(original, encoding="utf-8")
    path.write_text(content, encoding="utf-8")
    print(f"[OK] {rel_path} patched ({len(replacements)} edits). Backup: {backup.name}")


# ---------------------------------------------------------------------------
# 1. src/services/flowerSwapServiceBase.js -- processReverseSwap()
# ---------------------------------------------------------------------------

apply_patch(
    "src/services/flowerSwapServiceBase.js",
    [
        (
            """  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status !== 'SWAPPING') {
    console.warn(`[FlowerSwapBase] ${orderId} status=${order.status} — skipping reverse swap`);
    return;
  }

  const usdcAmount = order.usdcAmountIn;""",
            """  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status !== 'SWAPPING') {
    console.warn(`[FlowerSwapBase] ${orderId} status=${order.status} — skipping reverse swap`);
    return;
  }

  inspector.info("swap", `Reverse swap starting for ${orderId}`, {
    orderId, userId: String(order.userId), chain: "BASE", direction: "USDC_TO_FLOWER", step: "reverse_swap_start"
  });

  const usdcAmount = order.usdcAmountIn;""",
        ),
        (
            """    const usdcContract = new ethers.Contract(USDC_TOKEN, ERC20_ABI, signer);
    const bal = await usdcContract.balanceOf(signer.address);
    if (bal < amountIn) {
      throw new Error(`Treasury USDC balance ${ethers.formatUnits(bal, 6)} < ${usdcAmount}`);
    }

    const allowance = await usdcContract.allowance(signer.address, ROUTER);
    if (allowance < amountIn) {
      const approveTx = await usdcContract.approve(ROUTER, amountIn);
      await approveTx.wait();
    }""",
            """    const usdcContract = new ethers.Contract(USDC_TOKEN, ERC20_ABI, signer);
    inspector.info("swap", `Checking treasury USDC balance for ${orderId}`, {
      orderId, chain: "BASE", step: "treasury_balance_check"
    });
    const bal = await usdcContract.balanceOf(signer.address);
    if (bal < amountIn) {
      throw new Error(`Treasury USDC balance ${ethers.formatUnits(bal, 6)} < ${usdcAmount}`);
    }
    inspector.success("swap", `Treasury has sufficient USDC for ${orderId}`, {
      orderId, chain: "BASE", step: "treasury_balance_ok",
      treasuryBalance: parseFloat(ethers.formatUnits(bal, 6)), required: usdcAmount
    });

    const allowance = await usdcContract.allowance(signer.address, ROUTER);
    if (allowance < amountIn) {
      inspector.info("swap", `Approving router to spend USDC for ${orderId}`, {
        orderId, chain: "BASE", step: "approve_router"
      });
      const approveTx = await usdcContract.approve(ROUTER, amountIn);
      await approveTx.wait();
      inspector.success("swap", `Router approved for ${orderId}`, {
        orderId, chain: "BASE", step: "approve_router_confirmed"
      });
    }""",
        ),
        (
            """    const { getFlowerUsdtRate } = await import("./flower/flowerUsdtSwapService.js");
    const rate = await getFlowerUsdtRate();
    if (!rate) throw new Error("FLOWER price unavailable — refusing to swap without a slippage reference");
    const approxFlowerOut = usdcAmount / (rate * 1.5); // conservative floor — see note in flower/flowerSwapService.js
    const amountOutMin = ethers.parseUnits(""",
            """    const { getFlowerUsdtRate } = await import("./flower/flowerUsdtSwapService.js");
    const rate = await getFlowerUsdtRate();
    if (!rate) throw new Error("FLOWER price unavailable — refusing to swap without a slippage reference");
    const approxFlowerOut = usdcAmount / (rate * 1.5); // conservative floor — see note in flower/flowerSwapService.js
    inspector.info("swap", `Quote for ${orderId}: ~${approxFlowerOut.toFixed(4)} FLOWER at rate ${rate}`, {
      orderId, chain: "BASE", step: "quote", rate, approxFlowerOut
    });
    const amountOutMin = ethers.parseUnits(""",
        ),
        (
            """      sqrtPriceLimitX96: 0n
    });

    await recordPendingOperation({
      type: "FLOWER_REVERSE_SWAP",
      chain: "base",
      txHash: tx.hash,
      referenceId: orderId,
      token: "FLOWER",
    });

    const receipt = await tx.wait();

    const flowerReceived = parseTokenFromReceipt(receipt, FLOWER_TOKEN, 18);
    console.log(`[FlowerSwapBase] ${orderId} — received ${flowerReceived} FLOWER (tx: ${receipt.hash})`);""",
            """      sqrtPriceLimitX96: 0n
    });

    inspector.info("swap", `Swap tx broadcast for ${orderId}`, {
      orderId, chain: "BASE", step: "tx_broadcast", txHash: tx.hash
    });

    await recordPendingOperation({
      type: "FLOWER_REVERSE_SWAP",
      chain: "base",
      txHash: tx.hash,
      referenceId: orderId,
      token: "FLOWER",
    });

    const receipt = await tx.wait();

    const flowerReceived = parseTokenFromReceipt(receipt, FLOWER_TOKEN, 18);
    console.log(`[FlowerSwapBase] ${orderId} — received ${flowerReceived} FLOWER (tx: ${receipt.hash})`);
    inspector.success("swap", `Reverse swap confirmed for ${orderId}: ${flowerReceived} FLOWER`, {
      orderId, chain: "BASE", step: "reverse_swap_complete", txHash: receipt.hash, flowerReceived
    });""",
        ),
        (
            """  } catch (err) {
    console.error(`[FlowerSwapBase] ${orderId} — reverse swap FAILED:`, err.message);
    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: 'FAILED' });
    err.stage = (err?.receipt || err?.transactionHash) ? "post-transfer" : "pre-transfer";
    throw err;
  }
}""",
            """  } catch (err) {
    console.error(`[FlowerSwapBase] ${orderId} — reverse swap FAILED:`, err.message);
    inspector.error("swap", `Reverse swap failed for ${orderId}: ${err.message}`, {
      orderId, chain: "BASE", step: "reverse_swap_failure"
    });
    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: 'FAILED' });
    err.stage = (err?.receipt || err?.transactionHash) ? "post-transfer" : "pre-transfer";
    throw err;
  }
}""",
        ),
    ],
)

# ---------------------------------------------------------------------------
# 2. src/services/flower/flowerUsdtSwapService.js
# ---------------------------------------------------------------------------

apply_patch(
    "src/services/flower/flowerUsdtSwapService.js",
    [
        (
            'import { assertAddressAvailable }    from "./flowerOrderGuard.js";',
            'import { assertAddressAvailable }    from "./flowerOrderGuard.js";\n'
            'import inspector                     from "../blockchain/inspector/blockchainInspector.js";',
        ),
        (
            """  console.log(`[FlowerUsdt] ${orderId} — USDC debited, routing ${amount} USDC → FLOWER on ${normalizedChain}`);

  const executor = normalizedChain === "BASE\"""",
            """  console.log(`[FlowerUsdt] ${orderId} — USDC debited, routing ${amount} USDC → FLOWER on ${normalizedChain}`);
  inspector.info("swap", `USDC debited for ${orderId}, routing ${amount} USDC → FLOWER on ${normalizedChain}`, {
    orderId, userId: String(userId), chain: normalizedChain, direction: "USDC_TO_FLOWER", step: "ledger_debit_confirmed"
  });

  const executor = normalizedChain === "BASE\"""",
        ),
        (
            """  await FlowerOrder.updateOne({ orderId }, { status: "COMPLETED" });
  console.log(`[FlowerUsdt] ${orderId} — COMPLETED, ${netFlower} FLOWER credited`);
}""",
            """  await FlowerOrder.updateOne({ orderId }, { status: "COMPLETED" });
  console.log(`[FlowerUsdt] ${orderId} — COMPLETED, ${netFlower} FLOWER credited`);
  inspector.success("swap", `${orderId} completed — ${netFlower} FLOWER credited (fee ${feeAmount})`, {
    orderId, userId: String(order.userId), chain: normalizedChain, direction: "USDC_TO_FLOWER",
    step: "ledger_credit_confirmed", netFlower, feeAmount
  });
}""",
        ),
        (
            """export async function finalizeReverseSwapFailure(order, err) {
  const { orderId, userId, usdcAmountIn } = order;
  console.error(`[FlowerUsdt] ${orderId} — reverse swap failed: ${err.message}`);

  if (err.stage === "post-transfer") {
    console.error(`[FlowerUsdt] ${orderId} left in place for manual review — refund NOT auto-issued.`);
    return;
  }""",
            """export async function finalizeReverseSwapFailure(order, err) {
  const { orderId, userId, usdcAmountIn } = order;
  console.error(`[FlowerUsdt] ${orderId} — reverse swap failed: ${err.message}`);
  inspector.error("swap", `Reverse swap failed for ${orderId}: ${err.message}`, {
    orderId, userId: String(userId), direction: "USDC_TO_FLOWER", step: "reverse_swap_failure"
  });

  if (err.stage === "post-transfer") {
    console.error(`[FlowerUsdt] ${orderId} left in place for manual review — refund NOT auto-issued.`);
    inspector.warn("swap", `${orderId} needs manual review — swap tx may have landed, no auto-refund`, {
      orderId, userId: String(userId), direction: "USDC_TO_FLOWER", step: "manual_review_required"
    });
    return;
  }""",
        ),
        (
            """      console.log(`[FlowerUsdt] ${orderId} — USDC refunded: ${err.message}`);
    }
  } catch (refundErr) {""",
            """      console.log(`[FlowerUsdt] ${orderId} — USDC refunded: ${err.message}`);
      inspector.error("swap", `${orderId} failed — ${usdcAmountIn} USDC refunded: ${err.message}`, {
        orderId, userId: String(userId), direction: "USDC_TO_FLOWER", step: "reverse_swap_refunded"
      });
    }
  } catch (refundErr) {""",
        ),
    ],
)

# ---------------------------------------------------------------------------
# 3. src/pages/SwapInspector.tsx -- live log panel + dynamic polling
# ---------------------------------------------------------------------------

apply_patch(
    "src/pages/SwapInspector.tsx",
    [
        (
            """export default function SwapInspector() {
  const [orders, setOrders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [tab, setTab] = useState("__failed__");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api("/api/v1/admin/flower-orders");
    if (res.success) setOrders(res.orders);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);""",
            """// Poll cadence: 30s while any order is still moving through the
// pipeline, backing off to a 12h idle poll once everything is either
// COMPLETED or FAILED (no point hammering the API for a static list).
const ACTIVE_POLL_MS = 30 * 1000;
const IDLE_POLL_MS   = 12 * 60 * 60 * 1000;

// Live watcher log, fed by the existing admin SSE stream
// (/api/v1/admin/dashboard/stream), which inspectorBridge.js already
// forwards every inspector.info/success/warn/error("swap", ...) call
// into as type "blockchain.swap". Grouped by orderId, capped per order
// so a long-running order can't grow the log unbounded.
const MAX_LOG_LINES = 30;

type LiveLogEntry = { level: string; message: string; step?: string; timestamp: string };

export default function SwapInspector() {
  const [orders, setOrders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [tab, setTab] = useState("__failed__");
  const [loading, setLoading] = useState(true);
  const [liveLog, setLiveLog] = useState<Record<string, LiveLogEntry[]>>({});
  const ordersRef = useRef<any[]>([]);

  const load = useCallback(async () => {
    const res = await api("/api/v1/admin/flower-orders");
    if (res.success) setOrders(res.orders);
    setLoading(false);
  }, []);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = async () => {
      await load();
      if (cancelled) return;
      const hasActive = ordersRef.current.some(
        (o) => !o.status.startsWith("FAILED") && o.status !== "COMPLETED"
      );
      timer = setTimeout(tick, hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  // Live stream: reuses the existing admin SSE endpoint rather than
  // opening a second connection. Every "blockchain.swap" event carries
  // orderId in its metadata (set by inspector.*("swap", ..., { orderId, ... })
  // calls in flowerSwapServiceBase.js / flowerUsdtSwapService.js), so we
  // just bucket incoming events by orderId for the expanded row to render.
  useEffect(() => {
    const es = new EventSource("/api/v1/admin/dashboard/stream", { withCredentials: true });

    es.onmessage = (e) => {
      if (!e.data) return;
      let parsed: any;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return; // heartbeats etc. aren't JSON
      }
      if (parsed?.type !== "blockchain.swap") return;
      const orderId = parsed?.data?.orderId;
      if (!orderId) return;

      setLiveLog((prev) => {
        const existing = prev[orderId] || [];
        const next = [
          ...existing,
          {
            level: parsed.data.level,
            message: parsed.data.message,
            step: parsed.data.step,
            timestamp: parsed.timestamp,
          },
        ].slice(-MAX_LOG_LINES);
        return { ...prev, [orderId]: next };
      });
    };

    return () => es.close();
  }, []);""",
        ),
        (
            """                        <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                          <div>User: {order.userId}</div>""",
            """                        {liveLog[order.orderId]?.length > 0 && (
                          <div style={{
                            fontSize: "11px", fontFamily: "monospace",
                            background: "rgba(0,0,0,0.25)", borderRadius: "8px",
                            padding: "8px 10px", marginBottom: "12px",
                            maxHeight: "160px", overflowY: "auto",
                          }}>
                            {liveLog[order.orderId].map((entry, i) => {
                              const color =
                                entry.level === "ERROR" ? "#f87171" :
                                entry.level === "SUCCESS" ? "#4ade80" :
                                entry.level === "WARNING" ? "#facc15" : "#94a3b8";
                              return (
                                <div key={i} style={{ color, marginBottom: "2px" }}>
                                  [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.message}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                          <div>User: {order.userId}</div>""",
        ),
        (
            'import { useState, useEffect, useCallback } from "react";',
            'import { useState, useEffect, useCallback, useRef } from "react";',
        ),
    ],
)

print("\nAll edits applied. Next steps:")
print("  git --no-pager diff")
print("  # review, then commit")
print("  rm src/**/*.bak.%s patch_usdc_flower_live_stream.py  # after confirming" % STAMP)
