import mongoose from "mongoose";
import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";

const getAssetBalances = async (userId) => {
  const result = await Ledger.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $group: {
        _id: "$currency",
        credit: {
          $sum: { $ifNull: ["$credit", 0] }
        },
        debit: {
          $sum: { $ifNull: ["$debit", 0] }
        }
      }
    }
  ]);

  const balances = {};

  result.forEach(asset => {
    balances[asset._id] =
      asset.credit - asset.debit;
  });

  return balances;
};

export const getDashboard = async (req, res) => {
  try {

    const userId = req.user.id;

    const wallet =
      await Wallet.findOne({ userId });

    const balances =
      await getAssetBalances(userId);

    const recentTransactions =
      await Ledger.find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

    return res.json({
      success: true,

      wallet: {
        id: wallet?.iscanAddress,
        iscanAddress: wallet?.iscanAddress,
        linkedWallets:
          wallet?.linkedWallets || []
      },

      balances,

      recentTransactions
    });

  } catch (err) {

    console.error(
      "[DASHBOARD ERROR]",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard"
    });
  }
};
