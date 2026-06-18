import Wallet from "../models/walletModel.js";
import Transaction from "../models/transactionModel.js";
import CashoutRequest from "../models/CashoutRequest.js";
import crypto from "crypto";

const CASHOUT_FEE_RATE = 0.015;

export async function requestPayout(userId, amount, bankAccountId) {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw new Error("Wallet not found");
  if (wallet.balance < amount) throw new Error("Insufficient balance");

  const fee = parseFloat((amount * CASHOUT_FEE_RATE).toFixed(2));
  const netAmount = parseFloat((amount - fee).toFixed(2));
  const referenceId = "PAY-" + crypto.randomBytes(6).toString("hex").toUpperCase();

  // Deduct balance immediately and hold
  wallet.balance -= amount;
  await wallet.save();

  const tx = await Transaction.create({
    senderId: userId,
    receiverId: null,
    senderAddress: wallet.iscanAddress,
    receiverAddress: bankAccountId,
    amount,
    currency: "PHP",
    fee,
    type: "cashout",
    status: "pending",
    referenceId,
    metadata: { netAmount, provider: "manual_bank", bankAccountId }
  });

  const cashout = await CashoutRequest.create({
    userId,
    amount,
    destinationType: "BANK",
    destinationAccount: bankAccountId,
    status: "PENDING",
  });

  return { success: true, referenceId, fee, netAmount, cashoutId: cashout._id, transaction: tx };
}

export async function completePayout(cashoutId, adminNote = "") {
  const cashout = await CashoutRequest.findById(cashoutId);
  if (!cashout) throw new Error("Cashout request not found");
  if (cashout.status !== "PENDING") throw new Error("Already processed");

  cashout.status = "COMPLETED";
  await cashout.save();

  await Transaction.findOneAndUpdate(
    { "metadata.bankAccountId": cashout.destinationAccount, status: "pending" },
    { status: "settled", "metadata.adminNote": adminNote }
  );

  return { success: true, cashoutId };
}

export async function cancelPayout(cashoutId, reason = "") {
  const cashout = await CashoutRequest.findById(cashoutId);
  if (!cashout) throw new Error("Cashout request not found");
  if (cashout.status !== "PENDING") throw new Error("Already processed");

  // Refund balance
  const wallet = await Wallet.findOne({ userId: cashout.userId });
  if (wallet) { wallet.balance += cashout.amount; await wallet.save(); }

  cashout.status = "CANCELLED";
  await cashout.save();

  return { success: true, refunded: cashout.amount };
}
