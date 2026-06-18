// src/services/flower/flowerUsdtSwapService.js
// Internal ledger swap: FLOWER ↔ USDT
// Uses Katana DEX price for rate, settles balances in DB.

import { ethers }       from "ethers";
import { v4 as uuid }   from "uuid";
import Wallet           from "../../models/walletModel.js";
import Transaction      from "../../models/transactionModel.js";
import Ledger           from "../../models/ledgerModel.js";
import flowerConfig     from "../../../config/flower.js";
import { ERC20_ABI, KATANA_ROUTER_ABI, RONIN_TOKENS } from "../../../config/katana.js";

const { RONIN_RPC, FLOWER_TOKEN, KATANA_ROUTER } = flowerConfig;

const PLATFORM_FEE = 0.02; // 2%

// ── Get live FLOWER/USDT rate from Katana ────────────────────────────────────
export async function getFlowerUsdtRate() {
  try {
    const provider = new ethers.JsonRpcProvider(RONIN_RPC);
    const router   = new ethers.Contract(KATANA_ROUTER, KATANA_ROUTER_ABI, provider);

    const amountIn = ethers.parseUnits("1", 18); // 1 FLOWER
    const path     = [RONIN_TOKENS.FLOWER, RONIN_TOKENS.USDT ?? RONIN_TOKENS.USDC];

    const amounts  = await router.getAmountsOut(amountIn, path);
    const usdtOut  = parseFloat(ethers.formatUnits(amounts[1], 6)); // USDT = 6 decimals
    return usdtOut;
  } catch {
    // Fallback: use a safe static rate if RPC fails
    console.warn("[FlowerUsdt] Could not fetch live rate — using fallback 0.002");
    return 0.002;
  }
}

// ── Quote (no side effects) ───────────────────────────────────────────────────
export async function quoteFlowerUsdt({ fromCurrency, toCurrency, amount }) {
  const amt      = parseFloat(amount);
  const rate     = await getFlowerUsdtRate(); // FLOWER per 1 USDT equivalent
  const SPREAD   = 0.015;

  let out, display, youGetLabel, slippageLabel;

  if (fromCurrency === "FLOWER" && toCurrency === "USDT") {
    // FLOWER → USDT: multiply by rate, apply spread
    const gross   = amt * rate;
    const fee     = gross * PLATFORM_FEE;
    out           = gross * (1 - SPREAD) - fee;
    display       = `1 FLOWER = ${rate.toFixed(6)} USDT`;
    youGetLabel   = `${out.toFixed(4)} USDT`;
    slippageLabel = `${(gross * SPREAD).toFixed(4)} USDT (1.5%)`;
  } else {
    // USDT → FLOWER: divide by rate, apply spread
    const gross   = amt / rate;
    const fee     = gross * PLATFORM_FEE;
    out           = gross * (1 - SPREAD) - fee;
    display       = `1 USDT = ${(1 / rate).toFixed(2)} FLOWER`;
    youGetLabel   = `${out.toFixed(2)} FLOWER`;
    slippageLabel = `${(gross * SPREAD).toFixed(2)} FLOWER (1.5%)`;
  }

  return {
    rate,
    youGet: +out.toFixed(6),
    display,
    youGetLabel,
    slippage: +(out * SPREAD).toFixed(6),
    slippageLabel,
  };
}

// ── Execute: FLOWER → USDT ────────────────────────────────────────────────────
export async function settleFlowerToUsdt({ userId, amount, txRef = uuid() }) {
  const rate     = await getFlowerUsdtRate();
  const gross    = amount * rate;
  const fee      = gross * PLATFORM_FEE;
  const usdtOut  = +(gross * (1 - 0.015) - fee).toFixed(6);

  // Check FLOWER balance
  const flowerWallet = await Wallet.findOne({ userId, currency: "FLOWER" });
  if (!flowerWallet || flowerWallet.balance < amount)
    throw new Error(`Insufficient FLOWER balance. Available: ${flowerWallet?.balance ?? 0}`);

  // Deduct FLOWER
  flowerWallet.balance -= amount;
  await flowerWallet.save();

  try {
    // Credit USDT
    await Wallet.findOneAndUpdate(
      { userId, currency: "USDT" },
      { $inc: { balance: usdtOut } },
      { upsert: true, new: true }
    );

    // Ledger entries
    await Ledger.create({ referenceId: txRef, userId, transactionType: "debit",  debit: amount,  credit: 0,       currency: "FLOWER", description: "FLOWER→USDT swap debit" });
    await Ledger.create({ referenceId: txRef, userId, transactionType: "credit", debit: 0,       credit: usdtOut, currency: "USDT",   description: "FLOWER→USDT swap credit" });

    const tx = await Transaction.create({
      referenceId: txRef,
      senderId: userId, receiverId: userId,
      senderAddress: "ISCAN", receiverAddress: "ISCAN",
      amount, currency: "FLOWER",
      type: "swap", status: "settled",
      metadata: { rate, usdtOut, fee, destinationCurrency: "USDT" },
      ledgerGroupId: txRef
    });

    console.log(`[FlowerUsdt] ${amount} FLOWER → ${usdtOut} USDT for ${userId}`);
    return { txRef, rate, sourceAmount: amount, usdtOut, fee, transaction: tx };

  } catch (err) {
    // Rollback FLOWER
    flowerWallet.balance += amount;
    await flowerWallet.save();
    throw err;
  }
}

// ── Execute: USDT → FLOWER ────────────────────────────────────────────────────
export async function settleUsdtToFlower({ userId, amount, txRef = uuid() }) {
  const rate      = await getFlowerUsdtRate();
  const gross     = amount / rate;
  const fee       = gross * PLATFORM_FEE;
  const flowerOut = +(gross * (1 - 0.015) - fee).toFixed(4);

  // Check USDT balance
  const usdtWallet = await Wallet.findOne({ userId, currency: "USDT" });
  if (!usdtWallet || usdtWallet.balance < amount)
    throw new Error(`Insufficient USDT balance. Available: ${usdtWallet?.balance ?? 0}`);

  // Deduct USDT
  usdtWallet.balance -= amount;
  await usdtWallet.save();

  try {
    // Credit FLOWER
    await Wallet.findOneAndUpdate(
      { userId, currency: "FLOWER" },
      { $inc: { balance: flowerOut } },
      { upsert: true, new: true }
    );

    // Ledger entries
    await Ledger.create({ referenceId: txRef, userId, transactionType: "debit",  debit: amount,    credit: 0,         currency: "USDT",   description: "USDT→FLOWER swap debit" });
    await Ledger.create({ referenceId: txRef, userId, transactionType: "credit", debit: 0,         credit: flowerOut, currency: "FLOWER", description: "USDT→FLOWER swap credit" });

    const tx = await Transaction.create({
      referenceId: txRef,
      senderId: userId, receiverId: userId,
      senderAddress: "ISCAN", receiverAddress: "ISCAN",
      amount, currency: "USDT",
      type: "swap", status: "settled",
      metadata: { rate, flowerOut, fee, destinationCurrency: "FLOWER" },
      ledgerGroupId: txRef
    });

    console.log(`[FlowerUsdt] ${amount} USDT → ${flowerOut} FLOWER for ${userId}`);
    return { txRef, rate, sourceAmount: amount, flowerOut, fee, transaction: tx };

  } catch (err) {
    // Rollback USDT
    usdtWallet.balance += amount;
    await usdtWallet.save();
    throw err;
  }
}
