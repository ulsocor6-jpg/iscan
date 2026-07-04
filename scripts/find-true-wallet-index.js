// scripts/find-true-wallet-index.js
//
// For wallets where stored chainAddresses don't match what their recorded
// walletIndex derives to, this searches a range of indices to find the
// index that ACTUALLY produces the stored ETHEREUM address.
//
// This never touches an address. The goal is to find the correct
// walletIndex to match the address already in use — not the other way
// around. Overwriting a stored (possibly already-deposited-to) address
// to match a recorded index is exactly how the original incident
// happened; this script exists to prevent repeating it.
//
// Usage:
//   node scripts/find-true-wallet-index.js            # scan 0..2000
//   node scripts/find-true-wallet-index.js 5000        # scan 0..5000
//
// Read-only. Makes no writes.

import mongoose from "mongoose";
import dotenv from "dotenv";
import Wallet from "../src/models/walletModel.js";
import { deriveUserWallets } from "../src/services/hdWalletService.js";

dotenv.config();

const SCAN_RANGE = parseInt(process.argv[2], 10) || 2000;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
  const wallets = await Wallet.find({});
  console.log(`[SCAN] Checking ${wallets.length} wallets against indices 0..${SCAN_RANGE}\n`);

  // Pre-derive every index once, keyed by ETHEREUM address, so we don't
  // re-derive per wallet (would be O(wallets * range) HD derivations).
  console.log(`[SCAN] Pre-deriving ${SCAN_RANGE + 1} indices (this is the slow part, one pass only)...`);
  const addressToIndex = new Map();
  for (let i = 0; i <= SCAN_RANGE; i++) {
    const derived = await deriveUserWallets(i);
    addressToIndex.set(derived.ETHEREUM.address.toLowerCase(), i);
    if (i % 200 === 0) process.stdout.write(`  ...${i}\r`);
  }
  console.log(`\n[SCAN] Derivation table built. Checking wallets now.\n`);

  const results = [];

  for (const w of wallets) {
    const eth = (w.chainAddresses || []).find(ca => ca.chain === "ETHEREUM");
    if (!eth?.address) {
      console.log(`[SKIP] userId=${w.userId} — no ETHEREUM address stored`);
      continue;
    }
    const storedIndex = w.walletIndex ?? null;
    const foundIndex = addressToIndex.get(eth.address.toLowerCase());

    if (foundIndex === undefined) {
      console.log(`[NOT FOUND] userId=${w.userId} storedIndex=${storedIndex} — ` +
        `stored address ${eth.address} does not match ANY index in 0..${SCAN_RANGE}. ` +
        `Either it's outside this range, or it's a genuinely orphaned/mock address ` +
        `(no private key derivable at all — the original incident pattern).`);
      results.push({ userId: w.userId.toString(), storedIndex, storedAddress: eth.address, trueIndex: null });
      continue;
    }

    if (foundIndex === storedIndex) {
      // Fine — no action needed, just wasn't in our earlier check for some reason.
      continue;
    }

    console.log(`[MISMATCH] userId=${w.userId} recorded walletIndex=${storedIndex} ` +
      `but stored address ${eth.address} actually belongs to index=${foundIndex}. ` +
      `Fix: set walletIndex=${foundIndex} for this user. Do NOT change the address.`);
    results.push({ userId: w.userId.toString(), storedIndex, storedAddress: eth.address, trueIndex: foundIndex });
  }

  console.log(`\n[SCAN] Done. ${results.length} wallet(s) need walletIndex corrected (not address).`);
  if (results.length) {
    const fs = await import("fs");
    const path = `wallet-index-correction-${Date.now()}.json`;
    fs.writeFileSync(path, JSON.stringify(results, null, 2));
    console.log(`[SCAN] Details written to ${path}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("[SCAN FATAL]", err);
  process.exit(1);
});
