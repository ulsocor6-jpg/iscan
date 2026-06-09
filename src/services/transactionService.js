import Ledger from "../models/ledgerModel.js";
import Transaction from "../models/transactionModel.js";
import Wallet from "../models/walletModel.js";

/**
 * LEDGER BALANCE (SOURCE OF TRUTH)
 */
const getBalance = async (userId) => {
  const entries = await Ledger.find({ userId });

  let balance = 0;

  for (const row of entries) {
    balance += Number(row.credit || 0);
    balance -= Number(row.debit || 0);
  }

  return balance;
};

/**
 * PROCESS TRANSACTION (LEDGER ONLY)
 */
export const processTransaction = async ({
  senderId,
  receiverId,
  amount,
  currency = "USDC",
  type = "transfer",
  referenceId
}) => {
  const transferAmount = parseFloat(amount);

  if (!senderId || !receiverId || !transferAmount) {
    throw new Error("Invalid transaction data");
  }

  // 🔍 Validate balance from ledger ONLY
  const senderBalance = await getBalance(senderId);

  if (senderBalance < transferAmount) {
    throw new Error("Insufficient balance");
  }

  // 📒 DEBIT sender (ledger truth)
  await Ledger.create({
    referenceId,
    userId: senderId,
    transactionType: type,
    debit: transferAmount,
    credit: 0,
    currency,
    status: "completed",
    description: "Transaction debit"
  });

  // 📒 CREDIT receiver (ledger truth)
  await Ledger.create({
    referenceId,
    userId: receiverId,
    transactionType: type,
    debit: 0,
    credit: transferAmount,
    currency,
    status: "completed",
    description: "Transaction credit"
  });

  // 📒 AUDIT LOG ONLY (NOT MONEY SOURCE)
  const tx = await Transaction.create({
    referenceId,
    senderId,
    receiverId,
    amount: transferAmount,
    currency,
    type,
    status: "settled"
  });

  return tx;
};
