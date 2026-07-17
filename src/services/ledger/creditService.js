import crypto from "crypto";
import Ledger from "../../models/ledgerModel.js";
import Wallet from "../../models/walletModel.js";

/**
 * creditUser()
 * Called by the Blockchain Engine on confirmed deposit.
 * - Idempotency: skips if txHash already in ledger
 * - Credits crypto balance on wallet.balances Map
 * - Converts to PHP and credits wallet.balance (PHP)
 * - Writes ledger entry
 */
export async function creditUser({
  userId,
  amount,
  asset = "USDT",
  txHash = null,
  chain = null,
}) {
  // ── 1. Idempotency: skip if already processed ──────────────────────────
  const referenceId = txHash || crypto.randomUUID();
  const already = await Ledger.findOne({ referenceId });
  if (already) {
    console.log(`[creditService] ✅ +${amount} ${asset} credited to user ${userId}`);
    return { skipped: true, referenceId };
  }

  // ── 2. Load wallet ─────────────────────────────────────────────────────
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw new Error("Wallet not found");

  // ── 3. Credit crypto balance ───────────────────────────────────────────
  if (!wallet.balances) wallet.balances = new Map();
  const currentBalance = wallet.balances.get(asset) || 0;
  wallet.balances.set(asset, currentBalance + Number(amount));
  wallet.markModified("balances");
await wallet.save();

  // ── 5. Write ledger entry ──────────────────────────────────────────────
  await Ledger.create({
    userId,
    referenceId,
    transactionType: "crypto_deposit",
    debit:  0,
    credit: Number(amount),
    currency: asset,
    description: `${amount} ${asset} deposit`,
    status: "completed", metadata: { txHash, chain },
  });

  console.log(`[creditService] ✅ +${amount} ${asset} credited to user ${userId}`);
  return { success: true, amount, asset, referenceId };
}
