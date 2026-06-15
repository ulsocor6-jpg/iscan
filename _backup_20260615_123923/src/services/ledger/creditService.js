import crypto from "crypto";
import Ledger from "../../models/ledgerModel.js";
import Wallet from "../../models/walletModel.js";

export async function creditUser({
  userId,
  amount,
  asset = "USDT",
  txHash = null,
  chain = null
}) {

  const wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  if (!wallet.balances) {
    wallet.balances = new Map();
  }

  const currentBalance =
    wallet.balances.get(asset) || 0;

  wallet.balances.set(
    asset,
    currentBalance + Number(amount)
  );

  wallet.markModified("balances");

  await wallet.save();

  await Ledger.create({
    userId,
    referenceId:
      txHash ||
      crypto.randomUUID(),

    transactionType: "crypto_deposit",

    debit: 0,
    credit: Number(amount),

    currency: asset,

    description:
      `${asset} deposit credited`,

    status: "completed",

    metadata: {
      txHash,
      chain
    }
  });

  return true;
}
