import express from "express";
import crypto from "crypto";
import { requireAuth } from "../../middleware/authMiddleware.js";

import Wallet from "../models/walletModel.js";
import Transaction from "../models/transactionModel.js";
import Ledger from "../models/ledgerModel.js";

import { buildSettlementPlan } from "../services/settlementRouter.js";

const router = express.Router();

/**
 * COMPUTE BALANCE FROM LEDGER (SOURCE OF TRUTH)
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
 * UNIVERSAL TRANSFER ENGINE (LEDGER-ONLY VERSION)
 */
router.post("/transfer", requireAuth, async (req, res) => {
  try {
    console.log("TRANSFER REQUEST:", req.body);

    const {
      receiverAddress,
      amount,
      currency = "USDC",
      settlementMethod = "internal"
    } = req.body;

    const transferAmount = parseFloat(amount);

    if (!receiverAddress || !transferAmount || transferAmount <= 0) {
      return res.status(400).json({ error: "Invalid transfer data" });
    }

    // 🔍 GET SENDER WALLET (metadata only)
    const senderWallet = await Wallet.findOne({ userId: req.user.id });
    if (!senderWallet) {
      return res.status(404).json({ error: "Sender wallet not found" });
    }

    // 🔍 GET RECEIVER WALLET (metadata only)
    const receiverWallet = await Wallet.findOne({
      iscanAddress: receiverAddress
    });

    if (!receiverWallet) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    // 💰 LEDGER BALANCE CHECK (TRUTH SOURCE)
    const senderBalance = await getBalance(req.user.id);

    if (senderBalance < transferAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 🧠 BUILD SETTLEMENT PLAN
    const plan = buildSettlementPlan({
      fromCurrency: currency,
      toCurrency: currency,
      method: settlementMethod,
      amount: transferAmount
    });

    console.log("SETTLEMENT PLAN:", plan);

    const referenceId =
      plan.referenceId || crypto.randomBytes(12).toString("hex");

    // 📒 WRITE LEDGER ENTRIES (SOURCE OF TRUTH)
    // DEBIT sender
    await Ledger.create({
      referenceId,
      userId: req.user.id,
      transactionType: "transfer",
      debit: transferAmount,
      credit: 0,
      currency,
      description: `Transfer to ${receiverAddress}`,
      status: "completed"
    });

    // CREDIT receiver
    await Ledger.create({
      referenceId,
      userId: receiverWallet.userId,
      transactionType: "transfer",
      debit: 0,
      credit: transferAmount,
      currency,
      description: `Transfer from ${senderWallet.iscanAddress}`,
      status: "completed"
    });

    // 📒 TRANSACTION RECORD (AUDIT ONLY - NOT MONEY SOURCE)
    const tx = await Transaction.create({
      senderAddress: senderWallet.iscanAddress,
      receiverAddress,
      amount: transferAmount,
      currency,
      type: "transfer",
      status: plan.requiresExternalProvider ? "processing" : "settled",
      settlementMethod,
      referenceId
    });

    return res.json({
      success: true,
      message: "Transfer processed via ledger",
      settlement: plan,
      transaction: tx,
      ledgerMode: true
    });

  } catch (err) {
    console.error("TRANSFER ERROR:", err);
    return res.status(500).json({ error: "Transfer failed" });
  }
});

export default router;
