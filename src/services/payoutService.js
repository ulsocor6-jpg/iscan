import crypto from "crypto";
import Wallet from "../models/walletModel.js";
import Transaction from "../models/transactionModel.js";
import CashoutRequest from "../models/CashoutRequest.js";
import Ledger from "../models/ledgerModel.js";
import BankAccount from "../models/BankAccount.js";
import eventStreamService from "./eventStreamService.js";

const CASHOUT_FEE_RATE = 0.015;  // 1.5%
const MIN_PAYOUT = 100;
const MAX_PAYOUT = 50000;

/**
 * requestPayout()
 * User submits a cash-out request.
 * - Validates balance
 * - Deducts PHP immediately (held)
 * - Creates Transaction + CashoutRequest with referenceId
 * - Writes ledger debit
 */
export async function requestPayout(userId, amount, bankAccountId) {
  if (amount < MIN_PAYOUT) throw new Error(`Minimum payout is ₱${MIN_PAYOUT}`);
  if (amount > MAX_PAYOUT) throw new Error(`Maximum payout is ₱${MAX_PAYOUT}`);

  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw new Error("Wallet not found");
  if ((wallet.balance || 0) < amount) throw new Error(`Insufficient balance. Available: ₱${(wallet.balance || 0).toFixed(2)}`);

  const bank = await BankAccount.findOne({ _id: bankAccountId, userId });
  if (!bank) throw new Error("Bank account not found");

  const fee       = parseFloat((amount * CASHOUT_FEE_RATE).toFixed(2));
  const netAmount = parseFloat((amount - fee).toFixed(2));
  const referenceId = "PAY-" + crypto.randomBytes(6).toString("hex").toUpperCase();

  // Deduct PHP balance immediately (held until completed or refunded)
  wallet.balance -= amount;
  await wallet.save();

  // Transaction record
  const tx = await Transaction.create({
    senderId:        userId,
    receiverId:      null,
    senderAddress:   wallet.iscanAddress,
    receiverAddress: bank.accountNumber,
    amount,
    currency:        "PHP",
    fee,
    type:            "cashout",
    status:          "pending",
    referenceId,
    metadata: {
      netAmount,
      provider:      "manual_bank",
      bankAccountId,
      destinationType: bank.type,
    },
  });

  // Cashout request (admin dashboard picks this up)
  const cashout = await CashoutRequest.create({
    userId,
    amount,
    fee,
    netAmount,
    destinationType:    bank.type,         // MAYA | GCASH | BANK
    destinationAccount: bank.accountNumber,
    referenceId,
    status: "PENDING",
  });

  // Ledger debit
  await Ledger.create({
    userId,
    referenceId,
    transactionType: "cashout_request",
    debit:   amount,
    credit:  0,
    currency: "PHP",
    description: `Cash-out ₱${netAmount} to ${bank.type} (fee ₱${fee})`,
    status: "pending",
    metadata: { cashoutId: cashout._id, bankAccountId, fee, netAmount },
  });

  console.log(`[payoutService] Created ${referenceId} — ₱${netAmount} net to ${bank.type}`);
  return {
    success: true,
    referenceId,
    amount,
    fee,
    netAmount,
    destination: bank.type,
    cashoutId: cashout._id,
    transaction: tx,
  };
}

/**
 * completePayout()
 * Admin marks a cashout as completed after manually sending funds.
 */
export async function completePayout(cashoutId, adminNote = "") {
  const cashout = await CashoutRequest.findById(cashoutId);
  if (!cashout) throw new Error("Cashout request not found");
  if (cashout.status === "COMPLETED") throw new Error("Already completed");
  if (cashout.status === "CANCELLED") throw new Error("Cannot complete a cancelled request");

  cashout.status      = "COMPLETED";
  cashout.completedAt = new Date();
  cashout.adminNote   = adminNote;
  await cashout.save();

  eventStreamService.emit("withdrawal.completed", {
    entityId: cashout.referenceId || cashout._id.toString(),
    userId: cashout.userId ? cashout.userId.toString() : null,
    cashoutId: cashout._id.toString(),
    referenceId: cashout.referenceId,
    amount: cashout.amount,
    message: `Cashout ${cashout.referenceId} completed by admin — ₱${(cashout.netAmount ?? cashout.amount).toFixed(2)} sent to ${cashout.destinationType} (${cashout.destinationAccount}).`,
  }).catch(err => console.error("[payoutService] Event emit failed:", err.message));

  // Update transaction
  await Transaction.findOneAndUpdate(
    { referenceId: cashout.referenceId },
    { status: "settled", "metadata.adminNote": adminNote }
  );

  // Update ledger entry
  await Ledger.findOneAndUpdate(
    { referenceId: cashout.referenceId },
    { status: "completed" }
  );

  console.log(`[payoutService] ✅ Completed ${cashout.referenceId}`);
  return { success: true, cashoutId, referenceId: cashout.referenceId };
}

/**
 * cancelPayout()
 * Admin or system cancels and refunds PHP back to user wallet.
 */
export async function cancelPayout(cashoutId, reason = "") {
  const cashout = await CashoutRequest.findById(cashoutId);
  if (!cashout) throw new Error("Cashout request not found");
  if (cashout.status === "COMPLETED") throw new Error("Cannot cancel a completed payout");
  if (cashout.status === "CANCELLED") throw new Error("Already cancelled");

  // Refund PHP to wallet
  const wallet = await Wallet.findOne({ userId: cashout.userId });
  if (wallet) {
    wallet.balance += cashout.amount;
    await wallet.save();
  }

  cashout.status    = "CANCELLED";
  cashout.adminNote = reason;
  await cashout.save();

  eventStreamService.emit("withdrawal.rejected", {
    entityId: cashout.referenceId || cashout._id.toString(),
    userId: cashout.userId ? cashout.userId.toString() : null,
    cashoutId: cashout._id.toString(),
    referenceId: cashout.referenceId,
    amount: cashout.amount,
    reason,
    message: `Cashout ${cashout.referenceId} rejected and refunded (₱${cashout.amount}) — ${reason || "no reason given"}.`,
  }).catch(err => console.error("[payoutService] Event emit failed:", err.message));

  // Update transaction
  await Transaction.findOneAndUpdate(
    { referenceId: cashout.referenceId },
    { status: "cancelled", "metadata.cancelReason": reason }
  );

  // Refund ledger entry
  await Ledger.create({
    userId:          cashout.userId,
    referenceId:     `${cashout.referenceId}-REFUND`,
    transactionType: "cashout_refund",
    debit:   0,
    credit:  cashout.amount,
    currency: "PHP",
    description: `Refund for cancelled cashout ${cashout.referenceId}: ${reason}`,
    status: "completed",
    metadata: { cashoutId, reason },
  });

  console.log(`[payoutService] 🔄 Refunded ₱${cashout.amount} for ${cashout.referenceId}`);
  return { success: true, refunded: cashout.amount, referenceId: cashout.referenceId };
}
