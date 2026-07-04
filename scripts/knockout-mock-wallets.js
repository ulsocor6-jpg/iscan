// scripts/knockout-mock-wallets.js
//
// Finds every wallet still holding a mock / non-HD-derivable address and
// migrates it to a real HD-derived address. Does NOT touch wallets that
// are already correctly wired.
//
// A wallet is flagged as "mock" if any of the following is true:
//   - walletIndex is missing/null (never got a real HD index)
//   - chainAddresses is empty
//   - chainAddresses has 2+ entries that are all the SAME address
//     (real HD derivation gives a different address per chain path;
//      identical addresses across chains is the fingerprint of the old
//      SHA-256 fallback)
//
// Usage:
//   node scripts/knockout-mock-wallets.js --dry-run   # report only, no writes
//   node scripts/knockout-mock-wallets.js             # actually migrate
//
// Requires HD_WALLET_MNEMONIC and MONGODB_URI in env (via dotenv).
//
// IMPORTANT: this stops the bleeding going forward (new deposits land on
// the real address). It does NOT recover funds already sent to an old
// mock address — there is no private key for those, by construction.
// The audit file this script writes lists every old address so you can
// check each one on-chain for a stranded balance and handle it as a
// manual ledger credit to the affected user.

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import Wallet from "../src/models/walletModel.js";
import { deriveUserWallets, SUPPORTED_CHAINS } from "../src/services/hdWalletService.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

function isMockWallet(wallet) {
  if (wallet.walletIndex === undefined || wallet.walletIndex === null) return true;
  const addrs = wallet.chainAddresses || [];
  if (addrs.length === 0) return true;
  const uniqueAddresses = new Set(addrs.map(a => (a.address || "").toLowerCase()));
  if (addrs.length >= 2 && uniqueAddresses.size === 1) return true;
  return false;
}

async function main() {
  if (!process.env.HD_WALLET_MNEMONIC) {
    console.error("HD_WALLET_MNEMONIC is not set. Refusing to run — this would " +
      "either crash on every derivation or, worse, someone unsets it later and " +
      "the derivation silently starts throwing per hdWalletService's guard. Set it first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
  console.log(`[KNOCKOUT] Connected. Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE — will write changes"}`);

  const allWallets = await Wallet.find({});
  const mockWallets = allWallets.filter(isMockWallet);

  console.log(`[KNOCKOUT] ${allWallets.length} total wallets, ${mockWallets.length} flagged as mock`);

  if (mockWallets.length === 0) {
    console.log("[KNOCKOUT] Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Never reuse an index already assigned to a real wallet.
  const highest = await Wallet.findOne({ walletIndex: { $ne: null } }).sort({ walletIndex: -1 });
  let nextIndex = highest ? highest.walletIndex + 1 : 0;
  console.log(`[KNOCKOUT] Highest existing walletIndex: ${highest ? highest.walletIndex : "none"}. ` +
    `New indices start at ${nextIndex}.`);

  const auditTrail = [];

  // Sort flagged wallets by createdAt so index assignment is deterministic.
  mockWallets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  for (const wallet of mockWallets) {
    const oldAddresses = (wallet.chainAddresses || []).map(a => ({ chain: a.chain, address: a.address }));
    const oldWalletIndex = wallet.walletIndex ?? null;

    const assignedIndex = (oldWalletIndex !== null) ? oldWalletIndex : nextIndex;
    if (oldWalletIndex === null) nextIndex++;

    let derived;
    try {
      derived = await deriveUserWallets(assignedIndex);
    } catch (err) {
      console.error(`[KNOCKOUT] FAILED to derive for userId=${wallet.userId}: ${err.message}`);
      continue;
    }

    const newChainAddresses = Object.entries(derived).map(([chain, data]) => ({
      chain,
      address: data.address,
      chainId: SUPPORTED_CHAINS[chain].chainId,
      usdtBalance: 0,
      usdcBalance: 0
    }));

    auditTrail.push({
      userId: wallet.userId.toString(),
      iscanAddress: wallet.iscanAddress,
      oldWalletIndex,
      newWalletIndex: assignedIndex,
      oldAddresses,
      newAddresses: newChainAddresses.map(a => ({ chain: a.chain, address: a.address })),
    });

    console.log(`[KNOCKOUT] userId=${wallet.userId} old_index=${oldWalletIndex} -> new_index=${assignedIndex}`);
    for (const a of oldAddresses) console.log(`             OLD ${a.chain}: ${a.address}`);
    for (const a of newChainAddresses) console.log(`             NEW ${a.chain}: ${a.address}`);

    if (!DRY_RUN) {
      wallet.walletIndex = assignedIndex;
      wallet.chainAddresses = newChainAddresses;
      await wallet.save();
    }
  }

  const auditPath = `mock-wallet-migration-audit-${Date.now()}.json`;
  fs.writeFileSync(auditPath, JSON.stringify(auditTrail, null, 2));
  console.log(`\n[KNOCKOUT] ${auditTrail.length} wallet(s) ${DRY_RUN ? "would be" : "were"} migrated.`);
  console.log(`[KNOCKOUT] Audit trail written to ${auditPath}`);
  console.log(`[KNOCKOUT] NEXT STEP (manual): for every OLD address above, check on-chain for a ` +
    `stranded balance. There is no private key for those addresses — anything found there needs ` +
    `a manual ledger credit to the user, not a wallet fix.`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("[KNOCKOUT FATAL]", err);
  process.exit(1);
});
