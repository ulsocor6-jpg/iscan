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
import { retryOrder }                from "./flowerOrderRecovery.js";

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

  // Deposit addresses are REUSED across every order a user creates, so a
  // returning user who already holds FLOWER there from a prior deposit
  // has nothing new to send — flowerInboxWorker only reacts to a fresh
  // CONFIRMED BlockchainInbox transfer event, which will never arrive for
  // funds that already landed. Check the live on-chain balance up front;
  // if it already covers this order, skip WAITING_DEPOSIT and kick off
  // the same sweep -> swap -> settle chain flowerInboxWorker would trigger
  // for a genuine fresh deposit. (Root-caused via order
  // 7a267e30-fc5f-49bf-a8d1-1f510f0e8035, stuck at WAITING_DEPOSIT with
  // 7.3554 FLOWER already sitting at its deposit address.)
  const AMOUNT_TOLERANCE_PCT = 0.01; // matches flowerInboxWorker's tolerance
  let existingBalance = null;
  try {
    existingBalance = await getTokenBalance("BASE", depositAddress, "FLOWER");
  } catch (err) {
    console.warn(`[FlowerUsdt] Could not check existing FLOWER balance for ${depositAddress}: ${err.message}`);
  }

  // This widget is balance-based, not deposit-based: the UI shows the
  // user's live on-chain FLOWER balance and lets them swap up to that
  // amount. A request for more than they actually hold must be rejected
  // up front — silently falling back to WAITING_DEPOSIT here creates an
  // order that can never complete, since nothing new is coming to
  // deposit, and it just sits in the stuck-orders queue forever.
  if (existingBalance == null) {
    throw new Error("Could not verify your FLOWER balance right now — please try again in a moment.");
  }
  if (existingBalance < amount * (1 - AMOUNT_TOLERANCE_PCT)) {
    throw new Error(
      `Insufficient FLOWER balance: you have ${existingBalance.toFixed(6)} FLOWER, ` +
      `but requested to swap ${amount} FLOWER.`
    );
  }

  const orderId = txRef;
  await FlowerOrder.create({
    orderId,
    userId,
    token:          "FLOWER",
    chain:          "BASE",
    depositAddress: depositAddress.toLowerCase(),
    expectedAmount: amount,   // real target — verified by flowerInboxWorker, never self-declared
    source:         "USDT_WIDGET",
    status:         "DEPOSIT_RECEIVED",
    // Sweep only what was REQUESTED, never the full address balance —
    // the address is reused across every order this user creates, so
    // anything beyond `amount` belongs to a future order, not this one.
    // (Using the raw user-supplied `amount` here also avoids the float
    // round-trip precision loss that comes from converting an on-chain
    // balance through formatUnits()->parseFloat() and back.)
    receivedAmount: amount,
    currentStage:   "DEPOSIT"
  });

  console.log(`[FlowerUsdt] ${orderId} — ${amount} FLOWER already present at ${depositAddress} (balance: ${existingBalance}), sweeping immediately`);
  // Fire-and-forget: this endpoint already returns "processing" to the
  // client immediately. The sweep/swap/settle chain reports its own
  // progress via the Inspector.
  retryOrder(orderId, { isAdmin: true }).catch(err => {
    console.error(`[FlowerUsdt] ${orderId} — immediate sweep kickoff failed: ${err.message}`);
  });

  return {
    txRef:        orderId,
    rate,
    sourceAmount: amount,
    usdtOut,
    status:       "processing",
    message:      "Swap submitted. FLOWER already detected in your wallet — processing now.",
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
    // Credit the user's ledger with FLOWER — no on-chain send at settle
    // time. The user later withdraws FLOWER through the existing crypto
    // withdrawal flow (cryptoWithdrawalController.js), which already
    // debits this same ledger balance, estimates network+platform fees
    // live, and delivers on-chain via sendCryptoToAddress. This avoids an
    // extra on-chain send per swap — the token only moves once, when the
    // user actually chooses to withdraw it.
    await walletService.credit(order.userId, "FLOWER", netFlower, {
      referenceId: feeRef,
      description: `USDC→FLOWER swap settled — ${netFlower} FLOWER credited`,
      transactionType: "flower_swap_credit",
    });

    await FeeRecord.create({
      referenceId: feeRef, orderId, userId: order.userId,
      txType: "flower_swap", currency: "FLOWER",
      grossAmount: grossFlower, feePercent: PLATFORM_FEE, feeAmount, netAmount: netFlower,
      chain: normalizedChain, txHash: order.swapTxHash,
      metadata: { usdcAmountIn: order.usdcAmountIn, direction: "USDC_TO_FLOWER" },
    });
  }

  await FlowerOrder.updateOne({ orderId }, { status: "COMPLETED" });
  console.log(`[FlowerUsdt] ${orderId} — COMPLETED, ${netFlower} FLOWER credited to ledger`);
  inspector.success("swap", `${orderId} completed — ${netFlower} FLOWER credited to ledger (fee ${feeAmount})`, {
    orderId, userId: String(order.userId), chain: normalizedChain, direction: "USDC_TO_FLOWER",
    step: "flower_credited_ledger", netFlower, feeAmount
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
