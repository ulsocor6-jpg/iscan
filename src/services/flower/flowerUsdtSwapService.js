// src/services/flower/flowerUsdtSwapService.js
// FLOWER ↔ USDT swap service.
// FLOWER→USDT: routes through real on-chain pipeline (Base or Ronin).
//              Ledger is only credited AFTER on-chain swap confirms.
// USDT→FLOWER: disabled until reverse on-chain swap is implemented.

import { ethers }     from "ethers";
import { v4 as uuid } from "uuid";
import FlowerOrder    from "../../models/flower/flowerOrderModel.js";
import { processSwap }               from "../flowerSwapServiceBase.js";
import { sweepFlowerToTreasuryBase } from "./flowerSweepServiceBase.js";
import { assertAddressAvailable }    from "./flowerOrderGuard.js";

const RATE_TTL = 15 * 1000;
let _rateCache = { value: null, fetchedAt: 0 }; // cache cleared

export async function getFlowerUsdtRate() {
  if (_rateCache.value && Date.now() - _rateCache.fetchedAt < RATE_TTL) {
    return _rateCache.value;
  }
  let rate = null;
  try {
    const res  = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=flower-2&vs_currencies=usd",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const price = data?.["flower-2"]?.usd;
    if (price && price > 0) rate = price;
  } catch (err) {
    console.warn("[FlowerUsdt] CoinGecko failed:", err.message);
  }
  if (!rate) rate = _rateCache.value ?? null; // no hardcoded fallback
  _rateCache = { value: rate, fetchedAt: Date.now() };
  return rate;
}

export async function quoteFlowerUsdt({ fromCurrency, toCurrency, amount }) {
  const amt    = parseFloat(amount);
  const rate   = await getFlowerUsdtRate();
  const SPREAD = 0.015;
  let out, display, youGetLabel, slippageLabel;

  if (fromCurrency === "FLOWER" && toCurrency === "USDC") {
    const gross   = amt * rate;
    const fee     = gross * 0.02;
    out           = gross * (1 - SPREAD) - fee;
    display       = `1 FLOWER = ${rate.toFixed(6)} USDT`;
    youGetLabel   = `${out.toFixed(4)} USDT`;
    slippageLabel = `${(gross * SPREAD).toFixed(4)} USDT (1.5%)`;
  } else {
    // USDT→FLOWER disabled
    throw new Error("USDT→FLOWER swap is not available yet. Send FLOWER on-chain to your deposit address instead.");
  }

  return { rate, youGet: +out.toFixed(6), display, youGetLabel, slippageLabel };
}

// FLOWER→USDT: creates a FlowerOrder and triggers the real on-chain swap.
// Ledger credit only happens inside settle() after the swap tx confirms.
export async function settleFlowerToUsdt({ userId, amount, txRef = uuid() }) {
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  const rate     = await getFlowerUsdtRate();
  const gross    = amount * rate;
  const fee      = gross * 0.02;
  const usdtOut  = +(gross * (1 - 0.015) - fee).toFixed(6);

  // Get user's Base deposit address
  const { getOrCreateBaseDepositAddress } = await import("./baseWalletService.js");
  const { address: depositAddress } = await getOrCreateBaseDepositAddress(userId);

  // Deposit addresses are reused across every order this user creates —
  // refuse a second concurrent order on the same address.
  await assertAddressAvailable(depositAddress);

  // Create order — status starts at WAITING_DEPOSIT, not DEPOSIT_RECEIVED.
  // Previously this jumped straight to DEPOSIT_RECEIVED using the caller's
  // claimed `amount` with no on-chain check, and fired processSwap()
  // immediately — meaning a swap could be marked COMPLETED, backed by a
  // real tx, having verified nothing about whether this user's address
  // actually received any FLOWER at all. The sweep below is what actually
  // confirms the deposit exists before anything is swapped or credited.
  const orderId = txRef;
  const order = await FlowerOrder.create({
    orderId,
    userId,
    token:          "FLOWER",
    chain:          "BASE",
    depositAddress: depositAddress.toLowerCase(),
    expectedAmount: amount,
    receivedAmount: amount,
    source:         "USDT_WIDGET",
    status:         "WAITING_DEPOSIT"
  });

  console.log(`[FlowerUsdt] Created order ${orderId} — verifying deposit before routing ${amount} FLOWER through on-chain pipeline`);

  // Move to DEPOSIT_RECEIVED only for the sweep's own idempotency guard to
  // consume; the sweep itself is what verifies the on-chain balance covers
  // `amount` — it throws (leaving the order stuck, not silently succeeding)
  // if the address doesn't actually hold it.
  await FlowerOrder.updateOne({ orderId }, { status: "DEPOSIT_RECEIVED" });

  // Non-blocking from the caller's perspective, but sweep MUST complete
  // (and therefore verify the real balance) before processSwap ever runs.
  sweepFlowerToTreasuryBase(orderId)
    .then(() => processSwap(orderId))
    .catch(async err => {
      console.error(`[FlowerUsdt] sweep/swap failed for ${orderId}:`, err.message);

      if (err.stage === "post-transfer") {
        // A transfer may already be broadcast/pending — do NOT touch the
        // order automatically. Leave it for manual review:
        //   node scripts/inspect-flower-order.js <orderId>
        //   node scripts/fail-flower-order.js <orderId> "<reason>" --confirm
        console.error(
          `[FlowerUsdt] ${orderId} left in place for manual review — failure happened after ` +
          `an on-chain transfer may have been sent. Run scripts/inspect-flower-order.js before failing it.`
        );
        return;
      }

      // Nothing was ever sent on-chain (bad balance, missing HD index, etc.) —
      // safe to auto-fail so the deposit address is released immediately
      // instead of blocking the user until an admin runs a script by hand.
      try {
        const result = await FlowerOrder.updateOne(
          { orderId, status: "DEPOSIT_RECEIVED" },
          { status: "FAILED", failureReason: err.message }
        );
        if (result.modifiedCount > 0) {
          console.log(`[FlowerUsdt] ${orderId} auto-failed — deposit address released: ${err.message}`);
        }
      } catch (updateErr) {
        console.error(`[FlowerUsdt] ${orderId} — failed to auto-fail order:`, updateErr.message);
      }
    });

  return {
    txRef:        orderId,
    rate,
    sourceAmount: amount,
    usdtOut,
    status:       "processing",
    message:      "Swap submitted. Your USDT will be credited once the on-chain transaction confirms (~30s).",
  };
}

// USDT→FLOWER: not yet implemented on-chain
export async function settleUsdtToFlower({ userId, amount }) {
  throw new Error(
    "USDT→FLOWER is not available yet. To get FLOWER, purchase it on a DEX and send it to your deposit address."
  );
}
