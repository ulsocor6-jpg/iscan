import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "../services/walletService.js";
import { settleCryptoWithdrawal } from "../services/withdrawalProcessor.js";

export async function listPendingWithdrawals(req, res) {
  try {
    const withdrawals =
      await WithdrawalRequest.find({
        status: "pending_review"
      }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: withdrawals.length,
      withdrawals
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
}

export async function approveWithdrawal(req, res) {
  try {
    const withdrawal =
      await WithdrawalRequest.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({
        error: "Withdrawal not found"
      });
    }

    const isRetry = withdrawal.status === "failed" && withdrawal.type === "crypto";

    if (withdrawal.status !== "pending_review" && !isRetry) {
      return res.status(400).json({
        error: "Already processed"
      });
    }

    const balance =
      await walletService.getBalance(
        withdrawal.userId,
        withdrawal.asset
      );

    if (balance < withdrawal.amount) {
      return res.status(400).json({
        error: "Insufficient balance"
      });
    }

    // Crypto withdrawals reaching this manual path are ones that either
    // exceeded an AUTO_WITHDRAW_LIMIT_<ASSET> cap at request time, or are
    // being manually retried after a previous failed attempt — either way,
    // settle through the same shared logic the automatic flow uses.
    if (withdrawal.type === "crypto") {
      const result = await settleCryptoWithdrawal(withdrawal);
      if (!result.success) {
        return res.status(502).json({
          error: `On-chain send failed and was reversed: ${result.error}`,
          withdrawal: result.withdrawal
        });
      }
    } else {
      await walletService.debit(
        withdrawal.userId,
        withdrawal.asset,
        withdrawal.amount,
        {
          referenceId: `WD-${withdrawal._id}`,
          description: "Withdrawal approved"
        }
      );
      withdrawal.status = "approved";
    }

    withdrawal.approvedBy = req.user?.id || null;
    withdrawal.approvedAt = new Date();

    await withdrawal.save();

    res.json({
      success: true,
      withdrawal
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
}

import Ledger from "../models/ledgerModel.js";
import mongoose from "mongoose";

/**
 * GET /api/v1/admin/cashouts/:id/verify
 * Returns ledger debit proof + user balance for admin to review before completing
 */
export async function verifyCashout(req, res) {
  try {
    const { default: CashoutRequest } = await import("../models/CashoutRequest.js");
    const { default: User } = await import("../models/userModel.js");

    const cashout = await CashoutRequest.findById(req.params.id).lean();
    if (!cashout) return res.status(404).json({ error: "Not found" });

    const userId = new mongoose.Types.ObjectId(cashout.userId);

    // Ledger debit entry for this cashout
    const debitEntry = await Ledger.findOne({
      userId,
      debit: { $gt: 0 },
      $or: [
        { referenceId: cashout.referenceId },
        { transactionType: { $in: ['cashout', 'cashout_request'] } }
      ]
    }).sort({ createdAt: -1 }).lean();

    // Current ledger balance
    const agg = await Ledger.aggregate([
      { $match: { userId } },
      { $group: { _id: null, c: { $sum: '$credit' }, d: { $sum: '$debit' } } }
    ]);
    const currentBalance = agg.length ? agg[0].c - agg[0].d : 0;

    // Balance before cashout (add back the debit)
    const balanceBefore = currentBalance + (cashout.amount || 0) + (cashout.fee || 0);

    res.json({
      verified: !!debitEntry,
      cashout,
      debitProof: debitEntry ? {
        referenceId: debitEntry.referenceId,
        debit: debitEntry.debit,
        description: debitEntry.description,
        status: debitEntry.status,
        date: debitEntry.createdAt
      } : null,
      userBalance: {
        before: balanceBefore,
        after: currentBalance,
        debited: balanceBefore - currentBalance
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
