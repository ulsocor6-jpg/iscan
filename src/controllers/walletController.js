import mongoose from "mongoose";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";

// ── HELPERS ───────────────────────────────────────────────────────────────────

const toIscanAddr = (walletId) =>
  `ISCAN-${walletId.toString().slice(-10).toUpperCase()}`;

const getLedgerBalance = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalCredit: { $sum: { $ifNull: ["$credit", 0] } },
        totalDebit:  { $sum: { $ifNull: ["$debit",  0] } }
      }
    }
  ]);
  return result.length > 0
    ? result[0].totalCredit - result[0].totalDebit
    : 0;
};

const syncWalletBalance = async (userId) => {
  const available = await getLedgerBalance(userId);
  await Wallet.findOneAndUpdate(
    { userId },
    { availableBalance: available, balance: available, lastSyncedAt: new Date() }
  );
  return available;
};

// ── CONTROLLERS ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/wallet/summary
 * Full wallet snapshot: balances + ISCAN address + crypto wallets
 */
export const getWalletSummary = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ error: "Wallet not found." });

    // Always recalculate from ledger for accuracy
    const availableBalance = await syncWalletBalance(req.user.id);

    // Pending: ledger entries with status=pending
    const pendingResult = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id), status: "pending" } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$credit", 0] } } } }
    ]);
    const pendingBalance = pendingResult[0]?.total || 0;

    // In/out totals
    const totals = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id), status: "completed" } },
      {
        $group: {
          _id: null,
          totalIn:  { $sum: { $ifNull: ["$credit", 0] } },
          totalOut: { $sum: { $ifNull: ["$debit",  0] } }
        }
      }
    ]);
    const { totalIn = 0, totalOut = 0 } = totals[0] || {};

    res.json({
      success: true,
      wallet: {
        iscanAddress:      toIscanAddr(wallet._id),
        walletId:          toIscanAddr(wallet._id),
        availableBalance,
        pendingBalance,
        frozenBalance:     wallet.frozenBalance || 0,
        balance:           availableBalance,
        currency:          wallet.currency,
        status:            wallet.status,
        totalIn,
        totalOut,
        cryptoWallets:     wallet.cryptoWallets || [],
        lastSyncedAt:      wallet.lastSyncedAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/wallet/me
 * Lightweight — just ISCAN address and balance
 */
export const getWalletMe = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ error: "Wallet not found." });
    const available = await syncWalletBalance(req.user.id);
    const iscanAddress = toIscanAddr(wallet._id);
    res.json({ success: true, iscanAddress, walletId: iscanAddress, balance: available, _id: wallet._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/wallet/balance
 * Returns balance + in/out totals
 */
export const getBalance = async (req, res) => {
  try {
    const balance = await getLedgerBalance(req.user.id);
    const r = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id), status: "completed" } },
      { $group: { _id: null, totalIn: { $sum: { $ifNull: ["$credit",0] } }, totalOut: { $sum: { $ifNull: ["$debit",0] } } } }
    ]);
    const t = r[0] || { totalIn: 0, totalOut: 0 };
    res.json({ success: true, balance, availableBalance: balance, totalIn: t.totalIn, totalOut: t.totalOut });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/wallet/list
 * Returns linked crypto wallets + ISCAN address
 */
export const getWallets = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });
    const user   = await User.findById(req.user.id).select("linkedWallets");

    const iscanAddress = wallet ? toIscanAddr(wallet._id) : null;
    const cryptoWallets = wallet?.cryptoWallets || user?.linkedWallets || [];

    res.json({ success: true, wallets: cryptoWallets, iscanAddress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/wallet/link
 * Link a crypto wallet (MetaMask, Ronin, etc.)
 */
export const linkWallet = async (req, res) => {
  try {
    const { address, provider, chainId, nativeBalance, nativeToken, usdcBalance } = req.body;
    if (!address) return res.status(400).json({ error: "Wallet address required." });

    // Store in Wallet.cryptoWallets (new) and User.linkedWallets (legacy compat)
    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user.id },
      { $addToSet: { cryptoWallets: { address, provider, chainId, nativeBalance, nativeToken, usdcBalance, linkedAt: new Date() } } },
      { new: true }
    );

    await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { linkedWallets: { walletId: address, address, provider, chainId, nativeBalance, nativeToken, usdcBalance, addedAt: new Date() } } }
    );

    res.json({
      success: true,
      iscanAddress: wallet ? toIscanAddr(wallet._id) : null,
      cryptoWallets: wallet?.cryptoWallets || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/wallet/unlink
 * Unlink a crypto wallet by address
 */
export const unlinkWallet = async (req, res) => {
  try {
    const { address, walletId } = req.body;
    const addr = address || walletId;

    await Wallet.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { cryptoWallets: { address: addr } } }
    );
    await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { linkedWallets: { $or: [{ address: addr }, { walletId: addr }] } } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/wallet/linked
 * Link a fiat account (GCash, Maya, bank)
 */
export const linkFiatAccount = async (req, res) => {
  try {
    const { type, accountNumber, accountName } = req.body;
    if (!accountNumber) return res.status(400).json({ error: "Account number required." });

    await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { linkedWallets: { type, accountNumber, accountName, addedAt: new Date() } } }
    );

    res.json({ success: true, wallet: { type, accountNumber, accountName } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/wallet/create (internal use / admin)
 */
export const createWallet = async (req, res) => {
  try {
    const wallet = await Wallet.create({ userId: req.body.userId });
    res.json({ success: true, wallet });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
