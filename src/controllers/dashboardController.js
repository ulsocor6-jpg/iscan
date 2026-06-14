import mongoose from "mongoose";
import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";

import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getDashboard } from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/", requireAuth, getDashboard);

export default router;

const getLedgerBalance = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        credit: { $sum: { $ifNull: ["$credit", 0] } },
        debit: { $sum: { $ifNull: ["$debit", 0] } }
      }
    }
  ]);

  if (!result.length) return 0;
  return result[0].credit - result[0].debit;
};

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const wallet = await Wallet.findOne({ userId });

    const balance = await getLedgerBalance(userId);

    const recentTransactions = await Ledger.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);

    return res.json({
      success: true,
      wallet: {
        id: wallet?.iscanAddress,
        linkedWallets: wallet?.linkedWallets || []
      },
      balance,
      recentTransactions
    });

  } catch (err) {
    console.error("[DASHBOARD ERROR]", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard"
    });
  }
};
