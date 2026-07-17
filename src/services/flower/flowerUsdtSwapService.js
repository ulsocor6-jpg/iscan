// src/services/flower/flowerUsdtSwapService.js
// FLOWER ↔ USDT swap service.
// FLOWER→USDT: routes through real on-chain pipeline (Base or Ronin).
//              Ledger is only credited AFTER on-chain swap confirms.
// USDT→FLOWER: disabled until reverse on-chain swap is implemented.

import { ethers }     from "ethers";
import { v4 as uuid } from "uuid";
import FlowerOrder    from "../../models/flower/flowerOrderModel.js";
import FeeRecord      from "../../models/feeModel.js";
import walletService  from "../walletService.js";
import flowerConfig   from "../../../config/flower.js";
import { assertAddressAvailable }    from "./flowerOrderGuard.js";
import inspector                     from "../blockchain/inspector/blockchainInspector.js";
import Wallet          from "../../models/walletModel.js";
import { getTokenBalance }           from "../onchainBalanceService.js";
import { sweepStablecoinToTreasury } from "../treasury/stablecoinSweepService.js";
import { sendCryptoToAddress }       from "../treasury/treasurySendService.js";

const { PLATFORM_FEE } = flowerConfig; // 2

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

const SPREAD = 0.015;
const FEE    = 0.02; // matches PLATFORM_FEE in config/flower.js (2%)

export async function quoteFlowerUsdt({ fromCurrency, toCurrency, amount }) {
  const amt = parseFloat(amount);
  if (!(amt > 0)) throw new Error("Amount must be greater than 0");

  const rate = await getFlowerUsdtRate();
  if (!rate) throw new Error("FLOWER price temporarily unavailable — try again shortly.");

  let out, display, youGetLabel, slippageLabel;

  if (fromCurrency === "FLOWER" && toCurrency === "USDC") {
    const gross   = amt * rate;
    const fee     = gross * FEE;
    out           = gross * (1 - SPREAD) - fee;
    display       = `1 FLOWER = ${rate.toFixed(6)} USDC`;
    youGetLabel   = `${out.toFixed(4)} USDC`;
    slippageLabel = `${(gross * SPREAD).toFixed(4)} USDC (1.5%)`;

  } else if (fromCurrency === "USDC" && toCurrency === "FLOWER") {
    const grossFlower = amt / rate;
    const fee          = grossFlower * FEE;
    out                = grossFlower * (1 - SPREAD) - fee;
    display            = `1 FLOWER = ${rate.toFixed(6)} USDC`;
    youGetLabel        = `${out.toFixed(4)} FLOWER`;
    slippageLabel      = `${(grossFlower * SPREAD).toFixed(4)} FLOWER (1.5%)`;

  } else {
    throw new Error("Only FLOWER↔USDC is supported.");
  }

  if (!(out > 0)) throw new Error("Amount too small to quote after fees.");

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

  // Create order at WAITING_DEPOSIT. flowerInboxWorker (BlockchainInbox
  // watcher) is the sole source of truth for whether the deposit actually
  // landed — it verifies the real on-chain amount at depositAddress and
  // only then calls retryOrder(), which drives sweep -> swap -> settle.
  // This function never advances the order past WAITING_DEPOSIT itself.
  const orderId = txRef;
  await FlowerOrder.create({
    orderId,
    userId,
    token:          "FLOWER",
    chain:          "BASE",
    depositAddress: depositAddress.toLowerCase(),
    expectedAmount: amount,   // real target — verified by flowerInboxWorker, never self-declared
    source:         "USDT_WIDGET",
    status:         "WAITING_DEPOSIT"
  });

  console.log(`[FlowerUsdt] Created order ${orderId} — waiting for on-chain deposit of ${amount} FLOWER to ${depositAddress} (verified by flowerInboxWorker, same as GENERIC orders)`);

  return {
    txRef:        orderId,
    rate,
    sourceAmount: amount,
    usdtOut,
    status:       "processing",
    message:      "Swap submitted. Your USDT will be credited once the on-chain transaction confirms (~30s).",
  };
}

// Shared finalize handlers for USDC->FLOWER reverse swaps. Used by both
// the initial settle flow below AND admin retries in
// flowerOrderRecovery.js, so credit/refund logic only lives in one place.
export async function finalizeReverseSwapSuccess(orderId, normalizedChain) {
  const order        = await FlowerOrder.findOne({ orderId });
  const grossFlower  = order.flowerAmountOut;
  const feeAmount    = parseFloat((grossFlower * (PLATFORM_FEE / 100)).toFixed(6));
  const netFlower    = parseFloat((grossFlower - feeAmount).toFixed(6));

  const feeRef = orderId + "-fee";
  if (!(await FeeRecord.exists({ referenceId: feeRef }))) {
    // Send the real FLOWER to the user's own on-chain wallet — this used
    // to be an internal walletService ledger credit only, which the
    // Swaps page never even reads for crypto balances (it sums live
    // on-chain amounts). That made the swap invisible to the user: their
    // real balance never moved even though the order showed COMPLETED.
    const wallet = await Wallet.findOne({ userId: order.userId });
    const chainEntry = wallet?.chainAddresses?.find(
      c => c.chain?.toUpperCase() === normalizedChain
    );
    if (!chainEntry?.address) {
      throw new Error(`No ${normalizedChain} address on file for user ${order.userId} — cannot deliver FLOWER`);
    }

    const sendResult = await sendCryptoToAddress({
      chain: normalizedChain,
      currency: "FLOWER",
      amount: netFlower,
      toAddress: chainEntry.address,
      txRef: `${orderId}-flower-out`,
    });

    await FeeRecord.create({
      referenceId: feeRef, orderId, userId: order.userId,
      txType: "flower_swap", currency: "FLOWER",
      grossAmount: grossFlower, feePercent: PLATFORM_FEE, feeAmount, netAmount: netFlower,
      chain: normalizedChain, txHash: order.swapTxHash,
      metadata: { usdcAmountIn: order.usdcAmountIn, direction: "USDC_TO_FLOWER", sendTxHash: sendResult.txHash },
    });

    await FlowerOrder.updateOne({ orderId }, { flowerSendTxHash: sendResult.txHash });
  }

  await FlowerOrder.updateOne({ orderId }, { status: "COMPLETED" });
  console.log(`[FlowerUsdt] ${orderId} — COMPLETED, ${netFlower} FLOWER sent on-chain`);
  inspector.success("swap", `${orderId} completed — ${netFlower} FLOWER sent to user (fee ${feeAmount})`, {
    orderId, userId: String(order.userId), chain: normalizedChain, direction: "USDC_TO_FLOWER",
    step: "flower_sent_onchain", netFlower, feeAmount
  });
}

// order must have { orderId, userId, usdcAmountIn } at minimum — either the
// freshly-created order object or a reloaded doc from FlowerOrder.findOne.
export async function finalizeReverseSwapFailure(order, err) {
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
  }

  try {
    const result = await FlowerOrder.updateOne(
      { orderId, status: { $in: ["SWAPPING"] } },
      { status: "FAILED", failureReason: err.message, usdcHeld: false }
    );
    if (result.modifiedCount > 0) {
      await walletService.credit(userId, "USDC", usdcAmountIn, {
        referenceId: `${orderId}-usdc-refund`,
        description: `USDC→FLOWER swap failed — refund`,
        transactionType: "flower_swap_refund",
      });
      console.log(`[FlowerUsdt] ${orderId} — USDC refunded: ${err.message}`);
      inspector.error("swap", `${orderId} failed — ${usdcAmountIn} USDC refunded: ${err.message}`, {
        orderId, userId: String(userId), direction: "USDC_TO_FLOWER", step: "reverse_swap_refunded"
      });
    }
  } catch (refundErr) {
    console.error(`[FlowerUsdt] ${orderId} — CRITICAL: refund failed:`, refundErr.message);
    // TODO: wire telegramAlertService here — debited, never swapped, refund also failed.
  }
}

// Records an insufficient-balance failure so it's visible in Swap
// Inspector's "Needs attention" tab instead of a bare thrown error with no
// trace. `isRetry` distinguishes a brand-new order (create) from a retry of
// an order that already exists in the DB (update in place, same orderId).
// usdcHeld is explicitly set false either way — no debit is in effect.
async function recordInsufficientBalance({ orderId, userId, amount, normalizedChain, failureReason, isRetry }) {
  if (isRetry) {
    await FlowerOrder.updateOne({ orderId }, { status: "FAILED", failureReason, usdcHeld: false });
  } else {
    await FlowerOrder.create({
      orderId, userId, token: "FLOWER", chain: normalizedChain,
      direction: "USDC_TO_FLOWER", source: "USDT_WIDGET",
      usdcAmountIn: amount, status: "FAILED", failureReason, usdcHeld: false,
    });
  }
  console.warn(`[FlowerUsdt] ${orderId} — ${failureReason}`);
  inspector.warn("swap", `${orderId} — ${failureReason}`, {
    orderId, userId: String(userId), chain: normalizedChain, direction: "USDC_TO_FLOWER",
    step: "balance_check_failed",
  });
}

// Shared core for USDC→FLOWER: balance watcher -> debit -> real on-chain
// swap (treasury capital) -> credit FLOWER net of fee, auto-refunding the
// debit if the swap fails before anything broadcast on-chain.
//
// Used both for brand-new orders (settleUsdtToFlower, isRetry=false,
// creates the FlowerOrder) and for retrying an order whose funds are NOT
// currently held (retryDebitAndSwap, isRetry=true, updates the existing
// order in place). Never call this with isRetry=true for an order where
// usdcHeld is already true — that means the debit already succeeded and
// funds are in flight; re-debiting here would charge the user twice.
async function debitAndDispatchSwap({ orderId, userId, amount, normalizedChain, isRetry }) {
  // Real on-chain balance check — this used to check the internal ledger
  // (walletService.getBalance), which can be near-zero for a user whose
  // USDC lives entirely on-chain (e.g. from a direct deposit or a prior
  // sweep-based swap). That blocked genuinely-funded swaps before they
  // ever reached a real check. Ledger is not used for the crypto legs of
  // this flow at all anymore — see finalizeReverseSwapSuccess below.
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    const failureReason = `No wallet found for user ${userId}`;
    await recordInsufficientBalance({ orderId, userId, amount, normalizedChain, failureReason, isRetry });
    throw new Error(failureReason);
  }
  const chainEntry = wallet.chainAddresses?.find(
    c => c.chain?.toUpperCase() === normalizedChain
  );
  if (!chainEntry?.address) {
    const failureReason = `No ${normalizedChain} address on file for user ${userId}`;
    await recordInsufficientBalance({ orderId, userId, amount, normalizedChain, failureReason, isRetry });
    throw new Error(failureReason);
  }
  const onChainBalance = await getTokenBalance(normalizedChain, chainEntry.address, "USDC");
  if (onChainBalance === null || onChainBalance < amount) {
    const failureReason = `Insufficient USDC balance: has ${onChainBalance ?? 0} USDC, needs ${amount} USDC`;
    await recordInsufficientBalance({ orderId, userId, amount, normalizedChain, failureReason, isRetry });
    throw new Error(failureReason);
  }
  if (wallet.walletIndex === undefined || wallet.walletIndex === null) {
    const failureReason = `No walletIndex on file for user ${userId} — cannot sweep`;
    await recordInsufficientBalance({ orderId, userId, amount, normalizedChain, failureReason, isRetry });
    throw new Error(failureReason);
  }

  // Sweep the user's real USDC into treasury BEFORE dispatching the swap —
  // treasury needs to actually hold what it's about to trade.
  let sweepResult;
  try {
    sweepResult = await sweepStablecoinToTreasury({
      chain: normalizedChain.toLowerCase(),
      token: "USDC",
      walletIndex: wallet.walletIndex,
      amount,
    });
  } catch (sweepErr) {
    const failureReason = `Sweep failed: ${sweepErr.message}`;
    await recordInsufficientBalance({ orderId, userId, amount, normalizedChain, failureReason, isRetry });
    throw new Error(failureReason);
  }
  if (!sweepResult?.txHash || sweepResult.swept < amount) {
    const failureReason = `Sweep did not confirm expected amount: swept ${sweepResult?.swept ?? 0}, expected ${amount}`;
    await recordInsufficientBalance({ orderId, userId, amount, normalizedChain, failureReason, isRetry });
    throw new Error(failureReason);
  }

  if (isRetry) {
    await FlowerOrder.updateOne({ orderId }, { status: "SWAPPING", usdcHeld: true, failureReason: null, sweepTxHash: sweepResult.txHash });
  } else {
    await FlowerOrder.create({
      orderId, userId, token: "FLOWER", chain: normalizedChain,
      direction: "USDC_TO_FLOWER", source: "USDT_WIDGET",
      usdcAmountIn: amount, status: "SWAPPING", usdcHeld: true,
      sweepTxHash: sweepResult.txHash,
    });
  }

  console.log(`[FlowerUsdt] ${orderId} — USDC swept on-chain (${sweepResult.txHash}), routing ${amount} USDC → FLOWER on ${normalizedChain}`);
  inspector.info("swap", `USDC swept for ${orderId}, routing ${amount} USDC → FLOWER on ${normalizedChain}`, {
    orderId, userId: String(userId), chain: normalizedChain, direction: "USDC_TO_FLOWER", step: "sweep_confirmed", sweepTxHash: sweepResult.txHash
  });

  const executor = normalizedChain === "BASE"
    ? (await import("../flowerSwapServiceBase.js")).processReverseSwap
    : (await import("./flowerSwapService.js")).processReverseSwap;

  executor(orderId)
    .then(() => finalizeReverseSwapSuccess(orderId, normalizedChain))
    .catch((err) => finalizeReverseSwapFailure({ orderId, userId, usdcAmountIn: amount }, err));
}

export async function settleUsdtToFlower({ userId, amount, chain = "BASE", txRef = uuid() }) {
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  const normalizedChain = String(chain).toUpperCase();
  if (!["BASE", "RONIN"].includes(normalizedChain)) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  await debitAndDispatchSwap({ orderId: txRef, userId, amount, normalizedChain, isRetry: false });

  return {
    txRef,
    sourceAmount: amount,
    status: "processing",
    message: "Swap submitted. Your FLOWER will be credited once the on-chain transaction confirms (~30s).",
  };
}

// Retry entry point used by flowerOrderRecovery for a USDC_TO_FLOWER order
// whose funds are NOT currently held (order.usdcHeld === false): either it
// never got past the balance check, or a prior failure already refunded
// the user. Re-runs the exact same balance-check -> debit -> swap sequence
// against the existing orderId instead of calling the executor directly.
export async function retryDebitAndSwap(order) {
  const { orderId, userId, usdcAmountIn, chain } = order;
  const normalizedChain = String(chain).toUpperCase();
  await debitAndDispatchSwap({ orderId, userId, amount: usdcAmountIn, normalizedChain, isRetry: true });
  return FlowerOrder.findOne({ orderId });
}
