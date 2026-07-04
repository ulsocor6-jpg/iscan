// scripts/verify-wallet-integrity.js
//
// Sanity check to run after knockout-mock-wallets.js reports 0 flagged.
// Catches the failure mode that detector doesn't: two different users
// silently sharing the same HD-derived address (the exact bug that was
// in the old fix-wallet-addresses.js v1 — array-position derivation
// instead of persisted walletIndex).
//
// Checks:
//   1. No walletIndex is reused across two different wallets.
//   2. No on-chain address appears on more than one wallet.
//   3. Each wallet's stored chainAddresses actually match what
//      deriveUserWallets(wallet.walletIndex) produces right now —
//      catches drift if the mnemonic was ever rotated without
//      re-deriving stored addresses.
//
// Read-only. Makes no writes.
//
// Usage: node scripts/verify-wallet-integrity.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import Wallet from "../src/models/walletModel.js";
import { deriveUserWallets } from "../src/services/hdWalletService.js";

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
  const wallets = await Wallet.find({});
  console.log(`[VERIFY] Checking ${wallets.length} wallets\n`);

  let problems = 0;

  // 1. Duplicate walletIndex
  const byIndex = new Map();
  for (const w of wallets) {
    if (w.walletIndex === undefined || w.walletIndex === null) continue;
    if (!byIndex.has(w.walletIndex)) byIndex.set(w.walletIndex, []);
    byIndex.get(w.walletIndex).push(w.userId.toString());
  }
  for (const [idx, userIds] of byIndex.entries()) {
    if (userIds.length > 1) {
      problems++;
      console.log(`[COLLISION] walletIndex=${idx} is shared by users: ${userIds.join(", ")}`);
    }
  }

  // 2. Duplicate address across different users
  const byAddress = new Map();
  for (const w of wallets) {
    for (const ca of (w.chainAddresses || [])) {
      const key = `${ca.chain}:${(ca.address || "").toLowerCase()}`;
      if (!byAddress.has(key)) byAddress.set(key, new Set());
      byAddress.get(key).add(w.userId.toString());
    }
  }
  for (const [key, userIds] of byAddress.entries()) {
    if (userIds.size > 1) {
      problems++;
      console.log(`[COLLISION] address ${key} is shared by users: ${[...userIds].join(", ")}`);
    }
  }

  // 3. Stored address vs. freshly re-derived address (drift check)
  for (const w of wallets) {
    if (w.walletIndex === undefined || w.walletIndex === null) continue;
    let derived;
    try {
      derived = await deriveUserWallets(w.walletIndex);
    } catch (err) {
      problems++;
      console.log(`[ERROR] userId=${w.userId} — could not re-derive: ${err.message}`);
      continue;
    }
    for (const ca of (w.chainAddresses || [])) {
      const expected = derived[ca.chain]?.address?.toLowerCase();
      const actual = (ca.address || "").toLowerCase();
      if (expected && expected !== actual) {
        problems++;
        console.log(`[DRIFT] userId=${w.userId} chain=${ca.chain} stored=${actual} expected=${expected}`);
      }
    }
  }

  console.log(`\n[VERIFY] Done. ${problems} problem(s) found.`);
  if (problems === 0) {
    console.log("[VERIFY] Clean — no collisions, no drift.");
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("[VERIFY FATAL]", err);
  process.exit(1);
});
