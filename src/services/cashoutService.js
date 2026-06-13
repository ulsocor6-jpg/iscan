import Wallet from "../models/walletModel.js";
import Transaction from "../models/transactionModel.js";
import MayaProvider from "../integrations/mayaProvider.js";
import crypto from "crypto";

const CASHOUT_FEE_RATE = 0.015;

export async function cashout(userId, amount, account) {
  const wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  if (wallet.balance < amount) {
    throw new Error("Insufficient balance");
  }

  // STEP 1: calculate fee
  const fee = amount * CASHOUT_FEE_RATE;
  const netAmount = amount - fee;

  // STEP 2: generate reference
  const referenceId = "CSH-" + crypto.randomBytes(6).toString("hex");

  // STEP 3: create transaction (pending first)
  const tx = await Transaction.create({
    senderId: userId,
    receiverId: null,
    senderAddress: wallet.iscanAddress,
    receiverAddress: account,
    amount,
    currency: "PHP",
    fee,
    type: "cashout",
    status: "processing",
    ledgerGroupId: "ISCAN_MAIN_LEDGER",
    settlementMethod: "maya",
    referenceId,
    metadata: {
      netAmount,
      provider: "maya"
    }
  });

  try {
    // STEP 4: call Maya
    const result = await MayaProvider.sendMoney({
      amount: netAmount,
      account,
      referenceId
    });

    if (!result.success) {
      throw new Error("Maya payout failed");
    }

    // STEP 5: update wallet (ONLY after success)
    wallet.balance -= amount;
    await wallet.save();

    // STEP 6: finalize transaction
    tx.status = "settled";
    tx.settlementRef = result.referenceId;
    await tx.save();

    return {
      success: true,
      referenceId,
      fee,
      netAmount,
      transaction: tx
    };

  } catch (err) {
    // STEP 7: rollback transaction
    tx.status = "failed";
    tx.metadata = {
      ...tx.metadata,
      error: err.message
    };
    await tx.save();

    throw err;
  }
}
