import express from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";

import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";
import Transaction from "../models/transactionModel.js";

import { buildSettlementPlan } from "../services/settlementRouter.js";

const router = express.Router();

/**
 * LEDGER BALANCE CALCULATOR (SOURCE OF TRUTH)
 */
const getBalance = async (userId) => {
  const entries = await Ledger.find({ userId });

  let balance = 0;

  for (const row of entries) {
    balance += Number(row.credit || 0);
    balance -= Number(row.debit || 0);
  }

  return balance;
};

/**
 * PAYMENT ROUTE (LEDGER ONLY VERSION)
 */
router.post("/pay", requireAuth, async (req, res) => {
  try {
    console.log("PAYMENT REQUEST:", req.body);

    const {
      receiverAddress,
      amount,
      currency = "USDC",
      settlementMethod = "internal",
      description = "Payment"
    } = req.body;

    const payAmount = parseFloat(amount);

    if (!receiverAddress || !payAmount || payAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment data" });
    }

    // 🔍 Sender wallet (metadata only)
    const senderWallet = await Wallet.findOne({ userId: req.user.id });

    if (!senderWallet) {
      return res.status(404).json({ error: "Sender wallet not found" });
    }

    // 🔍 Receiver wallet (metadata only)
    const receiverWallet = await Wallet.findOne({
      iscanAddress: receiverAddress
    });

    if (!receiverWallet) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    // 💰 LEDGER BALANCE CHECK (ONLY SOURCE OF TRUTH)
    const senderBalance = await getBalance(req.user.id);

    if (senderBalance < payAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 🧠 SETTLEMENT PLAN
    const plan = buildSettlementPlan({
      fromCurrency: currency,
      toCurrency: currency,
      method: settlementMethod,
      amount: payAmount
    });

    const referenceId = plan.referenceId || cryptoRandom();

    // 📒 LEDGER DEBIT (SENDER)
    await Ledger.create({
      referenceId,
      userId: req.user.id,
      transactionType: "payment",
      debit: payAmount,
      credit: 0,
      currency,
      description: `Payment to ${receiverAddress} - ${description}`,
      status: "completed"
    });

    // 📒 LEDGER CREDIT (RECEIVER)
    await Ledger.create({
      referenceId,
      userId: receiverWallet.userId,
      transactionType: "payment",
      debit: 0,
      credit: payAmount,
      currency,
      description: `Payment from ${senderWallet.iscanAddress}`,
      status: "completed"
    });

    // 📒 AUDIT TRANSACTION LOG (NOT MONEY AUTHORITY)
    const tx = await Transaction.create({
      senderAddress: senderWallet.iscanAddress,
      receiverAddress,
      amount: payAmount,
      currency,
      type: "payment",
      status: plan.requiresExternalProvider ? "processing" : "settled",
      settlementMethod,
      referenceId,
      description
    });

    return res.json({
      success: true,
      message: "Payment processed via ledger",
      settlement: plan,
      transaction: tx,
      ledgerMode: true
    });

  } catch (err) {
    console.error("PAYMENT ERROR:", err);
    return res.status(500).json({ error: "Payment failed" });
  }
});

/**
 * SIMPLE CRYPTO HELPERS
 */
const cryptoRandom = () =>
  require("crypto").randomBytes(12).toString("hex");

export default router;
