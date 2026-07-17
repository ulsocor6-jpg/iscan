import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "../services/walletService.js";
import { settleCryptoWithdrawal } from "../services/withdrawalProcessor.js";
import eventStreamService from "../services/eventStreamService.js";

export async function getAllWithdrawals(req, res) {
  try {
    const withdrawals =
      await WithdrawalRequest.find({})
        .populate("userId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .limit(500);

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
      // PHP (maya/bank/gcash) withdrawals are already debited atomically at
      // REQUEST time — see paymentRoutes.js /cashout. Approving here means
      // "I have manually sent the money via Maya/GCash/Bank transfer" and
      // must NOT debit again.
      withdrawal.status = "completed";

      eventStreamService.emit("withdrawal.completed", {
        entityId: withdrawal.referenceId || withdrawal._id.toString(),
        userId: withdrawal.userId ? withdrawal.userId.toString() : null,
        cashoutId: withdrawal._id.toString(),
        referenceId: withdrawal.referenceId,
        amount: withdrawal.amount,
        message: `Withdrawal ${withdrawal.referenceId} completed by admin — ₱${(withdrawal.netAmount ?? withdrawal.amount).toFixed(2)} sent.`,
      }).catch(err => console.error("[adminWithdrawalController] Event emit failed:", err.message));
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

export async function rejectWithdrawal(req, res) {
  try {
    const { reason } = req.body;
    const withdrawal = await WithdrawalRequest.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }
    if (withdrawal.status !== "pending_review") {
      return res.status(400).json({ error: "Already processed" });
    }

    // PHP withdrawals were already debited at request time — refund before
    // marking rejected, so the user isn't left short with no path forward.
    // Crypto withdrawals that reach here were never debited (they only
    // debit inside settleCryptoWithdrawal on approval), so no refund needed.
    if (withdrawal.type !== "crypto") {
      // Only `withdrawal.amount` was ever debited (see paymentRoutes.js
      // /cashout) — the fee comes out of netAmount when sent, it isn't a
      // separate charge on top of amount. Refunding amount+fee here would
      // now over-refund.
      await walletService.credit(withdrawal.userId, withdrawal.asset, withdrawal.amount, {
        referenceId: `REFUND-${withdrawal.referenceId || withdrawal._id}`,
        description: `Withdrawal rejected — refund${reason ? `: ${reason}` : ""}`,
        transactionType: 'cashout_refund',
      });
    }

    withdrawal.status = "rejected";
    withdrawal.failReason = reason || "Rejected by admin";
    withdrawal.approvedBy = req.user?.id || null;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    eventStreamService.emit("withdrawal.rejected", {
      entityId: withdrawal.referenceId || withdrawal._id.toString(),
      userId: withdrawal.userId ? withdrawal.userId.toString() : null,
      cashoutId: withdrawal._id.toString(),
      referenceId: withdrawal.referenceId,
      amount: withdrawal.amount,
      reason: withdrawal.failReason,
      message: `Withdrawal ${withdrawal.referenceId} rejected and refunded — ${withdrawal.failReason}`,
    }).catch(err => console.error("[adminWithdrawalController] Event emit failed:", err.message));

    res.json({ success: true, withdrawal });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    // WithdrawalRequest is the live model — CashoutRequest is retired.
    const cashout = await WithdrawalRequest.findById(req.params.id).lean();
    if (!cashout) return res.status(404).json({ error: "Not found" });

    const userId = new mongoose.Types.ObjectId(cashout.userId);

    // Match the exact debit for THIS withdrawal — no fallback to a loose
    // transactionType match, which could surface a different cashout's
    // ledger entry entirely.
    const debitEntry = await Ledger.findOne({
      userId,
      debit: { $gt: 0 },
      referenceId: cashout.referenceId,
    }).sort({ createdAt: -1 }).lean();

    // Current ledger balance
    const agg = await Ledger.aggregate([
      { $match: { userId } },
      { $group: { _id: null, c: { $sum: '$credit' }, d: { $sum: '$debit' } } }
    ]);
    const currentBalance = agg.length ? agg[0].c - agg[0].d : 0;

    // Balance before cashout (add back the debit) — only `amount` is ever
    // debited (see paymentRoutes.js /cashout), fee comes out of netAmount
    // when sent, not charged separately from the user's balance.
    const balanceBefore = currentBalance + (cashout.amount || 0);

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
