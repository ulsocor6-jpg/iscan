import Wallet from "../../models/walletModel.js";
import Ledger from "../../models/ledgerModel.js";

export async function creditUser({
  userId,
  amount,
  txHash,
  chain
}) {
  if (!userId || !amount) return;

  const wallet = await Wallet.findOne({ userId });

  if (!wallet) throw new Error("Wallet not found");

  // 1. update wallet balance
  wallet.balance = (wallet.balance || 0) + amount;
  await wallet.save();

  // 2. ledger entry
  await Ledger.create({
    userId,
    type: "DEPOSIT",
    amount,
    currency: "USDT",
    referenceId: txHash,
    metadata: { chain }
  });

  console.log(`[LEDGER] credited ${userId} ${amount}`);
}
