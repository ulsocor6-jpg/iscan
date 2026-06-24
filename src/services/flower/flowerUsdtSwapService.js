// src/services/flower/flowerUsdtSwapService.js
// FLOWER ↔ USDT swap service.
// FLOWER→USDT: routes through real on-chain pipeline (Base or Ronin).
//              Ledger is only credited AFTER on-chain swap confirms.
// USDT→FLOWER: disabled until reverse on-chain swap is implemented.

import { ethers }     from "ethers";
import { v4 as uuid } from "uuid";
import FlowerOrder    from "../../models/flower/flowerOrderModel.js";
import { processSwap } from "../flowerSwapServiceBase.js";

const RATE_TTL = 60 * 1000;
let _rateCache = { value: null, fetchedAt: 0 };

export async function getFlowerUsdtRate() {
  if (_rateCache.value && Date.now() - _rateCache.fetchedAt < RATE_TTL) {
    return _rateCache.value;
  }
  let rate = null;
  try {
    const res  = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ronin-flower&vs_currencies=usd",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const price = data?.["ronin-flower"]?.usd;
    if (price && price > 0) rate = price;
  } catch (err) {
    console.warn("[FlowerUsdt] CoinGecko failed:", err.message);
  }
  if (!rate) rate = _rateCache.value || 0.0712;
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

  // Create order — pipeline will credit ledger after on-chain confirms
  const orderId = txRef;
  const order = await FlowerOrder.create({
    orderId,
    userId,
    token:          "FLOWER",
    chain:          "BASE",
    depositAddress: depositAddress.toLowerCase(),
    expectedAmount: amount,
    receivedAmount: amount,
    status:         "DEPOSIT_RECEIVED"
  });

  console.log(`[FlowerUsdt] Created order ${orderId} — routing ${amount} FLOWER through on-chain pipeline`);

  // Trigger on-chain swap (non-blocking — settle() will credit ledger on success)
  processSwap(orderId).catch(err => {
    console.error(`[FlowerUsdt] processSwap failed for ${orderId}:`, err.message);
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
