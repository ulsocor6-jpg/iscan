import mongoose from "mongoose";
import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";
import { getRate } from "../services/fx/rateProvider.js";

const _rateCache = {};
const _rateCacheMs = 60_000; // re-fetch FX rates at most once per minute

const getCachedRate = async (currency) => {
  const now = Date.now();
  if (_rateCache[currency] && now - _rateCache[currency].ts < _rateCacheMs) {
    return _rateCache[currency].rate;
  }
  try {
    const rate = await getRate(currency);
    if (rate) _rateCache[currency] = { rate, ts: now };
    return rate || 0;
  } catch { return 0; }
};


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

// Convert one balance (currency, amount) to PHP. PHP itself needs no conversion.
const toPHP = async (currency, amount) => {
  if (!amount) return 0;
  if (currency === "PHP") return amount;
  const rate = await getCachedRate(currency);
  return rate ? amount * rate : 0;
};

export const getDashboard = async (req, res) => {
  try {

    const userId = req.user.id;

    const wallet =
      await Wallet.findOne({ userId });

    const balances =
      await getAssetBalances(userId);

    const mergedBalances = { ...balances };

    // Convert every held currency to PHP and sum for the hero total
    const phpConversions = await Promise.all(
      Object.entries(mergedBalances)
        .filter(([, amount]) => amount > 0)
        .map(async ([currency, amount]) => ({
          currency,
          amount,
          php: await toPHP(currency, amount)
        }))
    );

    const totalBalancePHP = phpConversions.reduce(
      (sum, c) => sum + c.php,
      0
    );

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

      balances: mergedBalances,

      hero: {
        totalBalancePHP,
        breakdown: phpConversions
      },

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
