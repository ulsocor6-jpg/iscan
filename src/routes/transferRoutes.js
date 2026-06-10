import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { requireAuth } from "../../middleware/authMiddleware.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import Transaction from "../models/transactionModel.js";
import Ledger from "../models/ledgerModel.js";

const router = express.Router();

const toIscanAddr = (walletId) =>
  `ISCAN-${walletId.toString().slice(-10).toUpperCase()}`;

const getLedgerBalance = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null,
      totalCredit: { $sum: { $ifNull: ["$credit", 0] } },
      totalDebit:  { $sum: { $ifNull: ["$debit",  0] } }
    }}
  ]);
  return result.length > 0 ? result[0].totalCredit - result[0].totalDebit : 0;
};

const fetchPhpRate = async (currency) => {
  const coinMap = { BTC:"bitcoin", ETH:"ethereum", USDC:"usd-coin", USDT:"tether", MATIC:"matic-network", RON:"ronin" };
  const coinId = coinMap[currency.toUpperCase()];
  if (!coinId) return null;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=php`);
    const data = await res.json();
    return data[coinId]?.php || null;
  } catch { return null; }
};

// ─── POST /api/v1/transfer/send ───────────────────────────────────────────────
// Dashboard sends: { fromWallet, toWallet, amount, memo }
// Also accepts:    { receiverEmail, receiverAddress, amount, currency, notes }
router.post("/send", requireAuth, async (req, res) => {
  try {
    const {
      // Dashboard field names
      fromWallet, toWallet, memo,
      // Alternative field names
      receiverEmail, receiverAddress,
      amount,
      currency = "PHP",
      notes = ""
    } = req.body;

    const transferAmount = parseFloat(amount);
    if (!transferAmount || transferAmount <= 0)
      return res.status(400).json({ error: "Invalid amount." });

    // Resolve receiver — accept toWallet, receiverAddress, or receiverEmail
    const receiverTarget = toWallet || receiverAddress || null;
    if (!receiverTarget && !receiverEmail)
      return res.status(400).json({ error: "Provide recipient ISCAN Wallet ID or email." });

    // Find sender wallet
    const senderWallet = await Wallet.findOne({ userId: req.user.id });
    if (!senderWallet)
      return res.status(404).json({ error: "Your wallet was not found." });

    // Find receiver wallet
    let receiverWallet = null;
    if (receiverEmail) {
      const rUser = await User.findOne({ email: receiverEmail.toLowerCase() });
      if (!rUser) return res.status(404).json({ error: `No ISCAN user found for ${receiverEmail}` });
      receiverWallet = await Wallet.findOne({ userId: rUser._id });
    } else {
      // Match by last 10 chars of wallet _id (ISCAN address format)
      const suffix = receiverTarget.replace("ISCAN-", "").toUpperCase();
      const all = await Wallet.find({});
      receiverWallet = all.find(w => w._id.toString().slice(-10).toUpperCase() === suffix);
    }

    if (!receiverWallet)
      return res.status(404).json({ error: "Recipient wallet not found. Check the Wallet ID." });

    if (senderWallet._id.equals(receiverWallet._id))
      return res.status(400).json({ error: "Cannot transfer to your own wallet." });

    // Crypto → PHP conversion
    let phpAmount = transferAmount;
    let phpRate = null;
    if (currency !== "PHP") {
      phpRate = await fetchPhpRate(currency);
      if (!phpRate) return res.status(400).json({ error: `Could not fetch live rate for ${currency}. Try again.` });
      phpAmount = parseFloat((transferAmount * phpRate).toFixed(2));
    }

    // Balance check
    const senderBalance = await getLedgerBalance(req.user.id);
    if (senderBalance < phpAmount)
      return res.status(400).json({ error: `Insufficient balance. Available: ₱${senderBalance.toFixed(2)}` });

    const referenceId = crypto.randomBytes(12).toString("hex").toUpperCase();
    const senderIscan   = toIscanAddr(senderWallet._id);
    const receiverIscan = toIscanAddr(receiverWallet._id);
    const transferNotes = memo || notes || "";

    // Write ledger — debit sender
    await Ledger.create({
      referenceId: `${referenceId}-D`,
      userId: new mongoose.Types.ObjectId(req.user.id),
      transactionType: "transfer",
      debit: phpAmount, credit: 0, currency: "PHP",
      description: `Sent ₱${phpAmount.toFixed(2)} to ${receiverIscan}`,
      counterpartyAddress: receiverIscan,
      status: "completed",
      metadata: { originalCurrency: currency, originalAmount: transferAmount, phpRate }
    });

    // Write ledger — credit receiver
    await Ledger.create({
      referenceId: `${referenceId}-C`,
      userId: new mongoose.Types.ObjectId(receiverWallet.userId),
      transactionType: "transfer",
      debit: 0, credit: phpAmount, currency: "PHP",
      description: `Received ₱${phpAmount.toFixed(2)} from ${senderIscan}`,
      counterpartyAddress: senderIscan,
      status: "completed",
      metadata: { originalCurrency: currency, originalAmount: transferAmount, phpRate }
    });

    // Transaction audit record
    const tx = await Transaction.create({
      senderId: req.user.id,
      senderAddress: senderIscan,
      receiverAddress: receiverIscan,
      receiverEmail: receiverEmail || null,
      amount: transferAmount,
      currency, phpEquivalent: phpAmount, rateAtSend: phpRate,
      type: "transfer", status: "settled", settlementMethod: "manual",
      referenceId, notes: transferNotes
    });

    // Sync wallet balance snapshots
    await Wallet.findByIdAndUpdate(senderWallet._id,   { balance: await getLedgerBalance(req.user.id),          availableBalance: await getLedgerBalance(req.user.id) });
    await Wallet.findByIdAndUpdate(receiverWallet._id, { balance: await getLedgerBalance(receiverWallet.userId), availableBalance: await getLedgerBalance(receiverWallet.userId) });

    return res.json({ success: true, referenceId, phpAmount, currency, phpRate, transaction: tx });

  } catch (err) {
    console.error("[TRANSFER ERROR]", err);
    return res.status(500).json({ error: "Transfer failed: " + err.message });
  }
});

export default router;
