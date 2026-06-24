import walletService from "./walletService.js";
import Transaction from "../models/transactionModel.js";
import MayaProvider from "../integrations/mayaProvider.js";
import crypto from "crypto";

function getFlatFee(channel) {
  return (channel || "").toUpperCase() === "MARIBANK" ? 5 : 17;
}

export async function cashout(userId, amount, account, channel = "MARIBANK") {
  const balance = await walletService.getBalance(userId, "PHP");
  if (balance < amount) throw new Error("Insufficient balance");

  const fee = getFlatFee(channel);
  if (amount <= fee) throw new Error(`Amount must exceed the ₱${fee} fee`);
  const netAmount = amount - fee;

  const referenceId = "CSH-" + crypto.randomBytes(6).toString("hex");

  const tx = await Transaction.create({
    senderId: userId, receiverId: null,
    senderAddress: "ISCAN", receiverAddress: account,
    amount, currency: "PHP", fee,
    type: "cashout", status: "processing",
    ledgerGroupId: referenceId, settlementMethod: channel.toLowerCase(),
    referenceId,
    metadata: { netAmount, channel }
  });

  try {
    await walletService.debit(userId, "PHP", amount, {
      referenceId, description: `Cashout via ${channel} (fee ₱${fee})`, transactionType: "cashout"
    });

    let result = { success: true, referenceId };
    if (channel.toUpperCase() !== "MARIBANK") {
      result = await MayaProvider.sendMoney({ amount: netAmount, account, referenceId });
      if (!result.success) throw new Error("Payout provider failed");
    }

    tx.status = "settled";
    tx.settlementRef = result.referenceId;
    await tx.save();

    return { success: true, referenceId, fee, netAmount, transaction: tx };

  } catch (err) {
    await walletService.credit(userId, "PHP", amount, {
      referenceId: referenceId + "-REFUND", description: "Cashout rollback", transactionType: "cashout_refund"
    });
    tx.status = "failed";
    tx.metadata = { ...tx.metadata, error: err.message };
    await tx.save();
    throw err;
  }
}
