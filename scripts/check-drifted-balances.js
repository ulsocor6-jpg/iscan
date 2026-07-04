// scripts/check-drifted-balances.js
//
// For the wallets flagged by verify-wallet-integrity.js as DRIFT (stored
// address doesn't match what the current HD_WALLET_MNEMONIC derives),
// this checks REAL on-chain balances at their currently stored addresses.
//
// This does NOT need the old/original mnemonic — checking a balance only
// requires the address, not the private key. This tells us whether
// there's actually money sitting somewhere the current mnemonic can't
// reach, which is the single most important fact before doing anything
// else with these 11 accounts.
//
// Read-only. Makes no writes, sends no transactions.
//
// Usage: node scripts/check-drifted-balances.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import Wallet from "../src/models/walletModel.js";
import { deriveUserWallets } from "../src/services/hdWalletService.js";
import { getLiveBalancesForWallet } from "../src/services/onchainBalanceService.js";

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
  const wallets = await Wallet.find({});

  const drifted = [];
  for (const w of wallets) {
    if (w.walletIndex === undefined || w.walletIndex === null) continue;
    let derived;
    try {
      derived = await deriveUserWallets(w.walletIndex);
    } catch {
      continue;
    }
    const anyDrift = (w.chainAddresses || []).some(ca => {
      const expected = derived[ca.chain]?.address?.toLowerCase();
      return expected && expected !== (ca.address || "").toLowerCase();
    });
    if (anyDrift) drifted.push(w);
  }

  console.log(`[BALANCE CHECK] ${drifted.length} drifted wallet(s) found. Querying live balances...\n`);

  let anyFundsFound = false;

  for (const wallet of drifted) {
    console.log(`--- userId=${wallet.userId} (walletIndex=${wallet.walletIndex}) ---`);
    const live = await getLiveBalancesForWallet(wallet);
    for (const [chain, data] of Object.entries(live)) {
      if (data.error) {
        console.log(`  ${chain} (${data.address}): ERROR — ${data.error}`);
        continue;
      }
      const parts = [];
      if (data.native) parts.push(`native=${data.native}`);
      if (data.USDC) parts.push(`USDC=${data.USDC}`);
      if (data.USDT) parts.push(`USDT=${data.USDT}`);

      const hasBalance = (data.native > 0) || (data.USDC > 0) || (data.USDT > 0);
      if (hasBalance) {
        anyFundsFound = true;
        console.log(`  ⚠️  ${chain} (${data.address}): ${parts.join("  ")} — FUNDS PRESENT, NOT SWEEPABLE WITH CURRENT MNEMONIC`);
      } else {
        console.log(`  ${chain} (${data.address}): empty`);
      }
    }
    console.log("");
  }

  if (anyFundsFound) {
    console.log("[BALANCE CHECK] ⚠️  At least one drifted address holds a live balance. " +
      "This needs the original mnemonic (or private key) to recover — treat as urgent. " +
      "Do not overwrite these wallets' addresses until this is resolved.");
  } else {
    console.log("[BALANCE CHECK] No funds found at any drifted address currently. " +
      "Lower urgency, but these users still can't safely receive deposits until " +
      "re-provisioned with addresses derivable from the current mnemonic.");
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("[BALANCE CHECK FATAL]", err);
  process.exit(1);
});
