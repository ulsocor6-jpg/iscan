import { requestPayout, completePayout, cancelPayout } from "../services/payoutService.js";
import CashoutRequest from "../models/CashoutRequest.js";
import BankAccount from "../models/BankAccount.js";

export const createPayout = async (req, res) => {
  try {
    const { amount, bankAccountId } = req.body;
    if (!amount || !bankAccountId) return res.status(400).json({ error: "Amount and bank account required" });
    if (amount < 100) return res.status(400).json({ error: "Minimum payout is PHP 100" });

    const bank = await BankAccount.findOne({ _id: bankAccountId, userId: req.user.id });
    if (!bank) return res.status(404).json({ error: "Bank account not found" });

    const result = await requestPayout(req.user.id, amount, bankAccountId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getMyPayouts = async (req, res) => {
  try {
    const payouts = await CashoutRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, payouts });
  } catch (err) {
    res.status(500).json({ error: "Failed to load payouts" });
  }
};

// Admin only
export const adminCompletePayouts = async (req, res) => {
  try {
    const { cashoutId, adminNote } = req.body;
    const result = await completePayout(cashoutId, adminNote);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const adminCancelPayout = async (req, res) => {
  try {
    const { cashoutId, reason } = req.body;
    const result = await cancelPayout(cashoutId, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const adminGetAllPayouts = async (req, res) => {
  try {
    const payouts = await CashoutRequest.find().populate("userId", "email firstName lastName").sort({ createdAt: -1 });
    res.json({ success: true, payouts });
  } catch (err) {
    res.status(500).json({ error: "Failed to load payouts" });
  }
};
