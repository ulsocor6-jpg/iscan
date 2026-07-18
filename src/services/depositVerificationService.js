import Wallet from "../models/walletModel.js";
import walletService from "./walletService.js";
import Transaction from "../models/transactionModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import DepositVerificationLog from "../models/DepositVerificationLog.js";
import inspector from "./blockchain/inspector/blockchainInspector.js";

export async function verifyDeposit({

  senderAccount,
  receiverAccount,
  amount,
  channel,
  payload

}) {

  const wallet = await Wallet.findOne({
  linkedWallets: {
    $elemMatch: {
      provider: channel,
      accountNumber: senderAccount
    }
  }
});

if (!wallet) {

  await DepositVerificationLog.create({
    senderAccount,
    receiverAccount,
    receivedAmount: amount,
    channel,
    verificationResult: "SENDER_MISMATCH",
    rawPayload: payload
  });

  inspector.warn("php-deposit", `Deposit notification sender not linked to any wallet: ${senderAccount} via ${channel}`, {
    senderAccount, receiverAccount, amount, channel,
    step: "verify-sender",
  });

  return {
    matched:false,
    code:"SENDER_MISMATCH"
  };
}

const deposit = await DirectDeposit.findOne({
  userId: wallet.userId,
  channel,
  status:"PENDING",
  expiresAt:{ $gt:new Date() }
}).sort({ createdAt:-1 });

  if (!deposit) {

    await DepositVerificationLog.create({
      senderAccount,
      receiverAccount,
      receivedAmount: amount,
      channel,
      verificationResult: "NO_ACTIVE_REQUEST",
      rawPayload: payload
    });

    inspector.warn("php-deposit", `Payment received for ${wallet.userId} with no active deposit request: ${amount} via ${channel}`, {
      userId: wallet.userId, senderAccount, receiverAccount, amount, channel,
      step: "verify-match",
    });

    return {
      matched: false,
      code: "NO_ACTIVE_REQUEST"
    };
  }

  if (deposit.amount !== amount) {

    deposit.status = "PENDING_REVIEW";
    deposit.verificationResult = "AMOUNT_MISMATCH";
    await deposit.save();

    await DepositVerificationLog.create({
      referenceId: deposit.referenceId,
      userId: deposit.userId,
      senderAccount,
      receiverAccount,
      requestedAmount: deposit.amount,
      receivedAmount: amount,
      channel,
      verificationResult: "AMOUNT_MISMATCH",
      rawPayload: payload
    });

    inspector.error("php-deposit", `Amount mismatch for ${deposit.referenceId}: requested ${deposit.amount}, received ${amount}`, {
      orderId: deposit.referenceId,
      userId: deposit.userId,
      requestedAmount: deposit.amount,
      receivedAmount: amount,
      channel,
      step: "verify-amount",
    });

    return {
      matched: false,
      code: "AMOUNT_MISMATCH",
      deposit
    };
  }

  await walletService.credit(
    deposit.userId,
    "PHP",
    amount,
    {
      referenceId: deposit.referenceId,
      description: `Direct deposit ${channel}`,
      transactionType: "cashin"
    }
  );

  await Transaction.create({
    senderId: deposit.userId,
    receiverId: deposit.userId,
    senderAddress: senderAccount,
    receiverAddress: receiverAccount || "ISCAN",
    amount,
    currency: "PHP",
    type: "cashin",
    status: "completed",
    referenceId: deposit.referenceId,
    notes: `${channel} direct deposit`,
    metadata: {
      channel,
      senderAccount
    }
  });

  await DepositVerificationLog.create({
    referenceId: deposit.referenceId,
    userId: deposit.userId,
    senderAccount,
    receiverAccount,
    requestedAmount: deposit.amount,
    receivedAmount: amount,
    channel,
    verificationResult: "MATCHED",
    rawPayload: payload
  });

  deposit.status = "CREDITED";
  deposit.verificationResult = "MATCHED";
  deposit.creditedAt = new Date();

  await deposit.save();

  inspector.success("php-deposit", `Auto-matched and credited ${amount} PHP for ${deposit.referenceId}`, {
    orderId: deposit.referenceId,
    userId: deposit.userId,
    amount,
    channel,
    step: "credited",
  });

  return {
    matched: true,
    code: "MATCHED",
    deposit
  };
}
