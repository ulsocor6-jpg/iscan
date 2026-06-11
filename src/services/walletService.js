import crypto from "crypto";
import mongoose from "mongoose";
import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";

// ── HELPERS ───────────────────────────────────────────────────────────────────

export const toIscanAddr = (walletId) =>
  `ISCAN-${walletId.toString().slice(-10).toUpperCase()}`;

export const getLedgerBalance = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: "completed" } },
    {
      $group: {
        _id: null,
        c: { $sum: { $ifNull: ["$credit", 0] } },
        d: { $sum: { $ifNull: ["$debit",  0] } }
      }
    }
  ]);
  return result.length > 0 ? result[0].c - result[0].d : 0;
};

export const getPendingBalance = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: "pending" } },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$credit", 0] } } } }
  ]);
  return result[0]?.total || 0;
};

// ── WALLET SERVICE ────────────────────────────────────────────────────────────

export const WalletService = {

  /**
   * Create a new internal wallet for a user
   * Called by authController after registration
   */
  async createWallet(userId) {
    const tempId = new mongoose.Types.ObjectId();
    return await Wallet.create({
      _id: tempId,
      userId,
      iscanAddress: toIscanAddr(tempId),
      availableBalance: 0,
      pendingBalance: 0,
      frozenBalance: 0,
      balance: 0,
      status: "active"
    });
  },

  /**
   * Get wallet with live balances from ledger
   */
  async getWallet(userId) {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return null;

    const available = await getLedgerBalance(userId);
    const pending   = await getPendingBalance(userId);

    // Sync snapshot
    await Wallet.findByIdAndUpdate(wallet._id, {
      availableBalance: available,
      pendingBalance: pending,
      balance: available,
      lastSyncedAt: new Date()
    });

    return {
      ...wallet.toObject(),
      iscanAddress:      toIscanAddr(wallet._id),
      availableBalance:  available,
      pendingBalance:    pending,
      frozenBalance:     wallet.frozenBalance || 0,
      balance:           available
    };
  },

  /**
   * Debit a wallet — writes ledger entry
   * Session-safe for atomic transfers
   */
  async debit({ userId, amount, currency = "PHP", description, referenceId, transactionType = "transfer", counterpartyAddress = null, session = null, status = "completed" }) {
    const balance = await getLedgerBalance(userId);
    if (balance < amount) throw new Error(`Insufficient balance. Available: ₱${balance.toFixed(2)}`);

    const entry = await Ledger.create([{
      referenceId,
      userId: new mongoose.Types.ObjectId(userId),
      transactionType,
      debit: amount,
      credit: 0,
      currency,
      description,
      status,
      counterpartyAddress
    }], session ? { session } : {});

    await this.syncBalance(userId);
    return entry[0];
  },

  /**
   * Credit a wallet — writes ledger entry
   */
  async credit({ userId, amount, currency = "PHP", description, referenceId, transactionType = "transfer", counterpartyAddress = null, session = null, status = "completed" }) {
    const entry = await Ledger.create([{
      referenceId,
      userId: new mongoose.Types.ObjectId(userId),
      transactionType,
      debit: 0,
      credit: amount,
      currency,
      description,
      status,
      counterpartyAddress
    }], session ? { session } : {});

    await this.syncBalance(userId);
    return entry[0];
  },

  /**
   * Sync wallet balance snapshot from ledger
   */
  async syncBalance(userId) {
    const available = await getLedgerBalance(userId);
    const pending   = await getPendingBalance(userId);
    await Wallet.findOneAndUpdate(
      { userId },
      { availableBalance: available, pendingBalance: pending, balance: available, lastSyncedAt: new Date() }
    );
    return available;
  },

  /**
   * Freeze an amount (compliance / dispute)
   */
  async freeze(userId, amount, reason) {
    const ref = "FRZ-" + crypto.randomBytes(6).toString("hex").toUpperCase();
    await Ledger.create({
      referenceId: ref,
      userId: new mongoose.Types.ObjectId(userId),
      transactionType: "freeze",
      debit: amount,
      credit: 0,
      currency: "PHP",
      description: `Frozen: ${reason}`,
      status: "frozen"
    });
    await Wallet.findOneAndUpdate({ userId }, { $inc: { frozenBalance: amount } });
    return ref;
  }
};
