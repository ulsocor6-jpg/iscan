import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";
import Transaction from "../models/transactionModel.js";
import { processTransaction } from "../services/transactionService.js";

/**
 * LEDGER BALANCE CALCULATION
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
 * TRANSFER CONTROLLER (LEDGER ONLY)
 */
export const transfer = async (req, res) => {
  try {
    console.log("TRANSFER REQUEST:", req.body);

    const { receiverAddress, amount, currency = "USDC" } = req.body;

    const transferAmount = parseFloat(amount);

    if (!receiverAddress || !transferAmount || transferAmount <= 0) {
      return res.status(400).json({ error: "Invalid transfer data" });
    }

    // 🔍 Sender wallet (metadata only)
    const senderWallet = await Wallet.findOne({ userId: req.user.id });

    if (!senderWallet) {
      return res.status(404).json({ error: "Sender wallet not found" });
    }

    // 🔍 Receiver wallet (metadata only)
    const receiverWallet = await Wallet.findOne({
      iscanAddress: receiverAddress
    });

    if (!receiverWallet) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    // 💰 LEDGER BALANCE CHECK (ONLY TRUTH)
    const senderBalance = await getBalance(req.user.id);

    if (senderBalance < transferAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const referenceId = cryptoRandom();

    // 🔥 PROCESS VIA SERVICE (LEDGER ONLY)
    const tx = await processTransaction({
      senderId: req.user.id,
      receiverId: receiverWallet.userId,
      amount: transferAmount,
      currency,
      type: "transfer",
      referenceId
    });

    return res.json({
      success: true,
      message: "Transfer completed via ledger system",
      transaction: tx,
      ledgerMode: true
    });

  } catch (err) {
    console.error("TRANSFER ERROR:", err);
    return res.status(500).json({ error: err.message || "Transfer failed" });
  }
};

/**
 * CRYPTO HELPER
 */
const cryptoRandom = () =>
  require("crypto").randomBytes(12).toString("hex");
