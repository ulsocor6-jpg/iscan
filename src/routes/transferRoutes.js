import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";

import { requireAuth } from "../middleware/authMiddleware.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import Transaction from "../models/transactionModel.js";
import Ledger from "../models/ledgerModel.js";
import TransactionService from "../services/transactionService.js";

const router = express.Router();

/**
 * GET LEDGER BALANCE (SOURCE OF TRUTH)
 */
const getLedgerBalance = async (userId, asset = "PHP") => {
  const result = await Ledger.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        currency: asset
      }
    },
    {
      $group: {
        _id: null,
        credit: { $sum: { $ifNull: ["$credit", 0] } },
        debit: { $sum: { $ifNull: ["$debit", 0] } }
      }
    }
  ]);

  return result.length > 0 ? result[0].credit - result[0].debit : 0;
};

/**
 * RESOLVE RECEIVER
 */
const resolveReceiver = async (receiverEmail, receiverAddress) => {
  if (receiverEmail) {
    const user = await User.findOne({ email: receiverEmail.toLowerCase() });
    if (!user) return null;
    return Wallet.findOne({ userId: user._id });
  }

  if (receiverAddress) {
    return Wallet.findOne({
      iscanAddress: receiverAddress
    });
  }

  return null;
};

/**
 * POST /send
 */
router.post("/send", requireAuth, async (req, res) => {
  try {
    const {
      receiverEmail,
      receiverAddress,
      amount,
      asset = "PHP",
      notes = ""
    } = req.body;

    const transferAmount = parseFloat(amount);

    if (!transferAmount || transferAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    // =========================
    // 1. GET SENDER WALLET
    // =========================
    const senderWallet = await Wallet.findOne({ userId: req.user.id });

    if (!senderWallet) {
      return res.status(404).json({
        success: false,
        message: "Sender wallet not found"
      });
    }

    // =========================
    // 2. GET RECEIVER WALLET
    // =========================
    const receiverWallet = await resolveReceiver(receiverEmail, receiverAddress);

    if (!receiverWallet) {
      return res.status(404).json({
        success: false,
        message: "Receiver wallet not found"
      });
    }

    if (senderWallet._id.equals(receiverWallet._id)) {
      return res.status(400).json({
        success: false,
        message: "Cannot transfer to self"
      });
    }

    // =========================
    // 3. BALANCE CHECK (LEDGER TRUTH)
    // =========================
    const senderBalance = await getLedgerBalance(req.user.id, asset);

    if (senderBalance < transferAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    // =========================
    // 4. EXECUTE TRANSFER (ENGINE)
    // =========================
    const result = await TransactionService.transfer({
      senderId: req.user.id,
      receiverId: receiverWallet.userId,
      amount: transferAmount,
      asset,
      referenceId: crypto.randomUUID()
    });

    // =========================
    // 5. RESPONSE
    // =========================
    return res.json({
      success: true,
      message: "Transfer completed",
      data: result
    });

  } catch (err) {
    console.error("[TRANSFER ERROR]", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

export default router;
