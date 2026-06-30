/**
 * migrate-activate-bank-accounts.js
 *
 * ONE-TIME FIX. Flips existing BankAccount records from status "pending" to
 * "active" so that already-linked Maya/GCash/Bank accounts become eligible
 * for auto-credit matching in src/core/processTransaction.js.
 *
 * Going forward this is no longer needed — bankController.js now sets
 * status: "active" at creation time — but accounts linked BEFORE that fix
 * are still stuck at "pending" and need this one-time backfill.
 *
 * Run the read-only audit-bank-account-status.js first to see what this
 * will affect.
 *
 * Usage:
 *   node migrate-activate-bank-accounts.js          (dry run, no writes)
 *   node migrate-activate-bank-accounts.js --apply  (actually updates)
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import BankAccount from "./src/models/BankAccount.js";

dotenv.config();

const apply = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const toActivate = await BankAccount.find({ status: "pending" })
  .select("accountName accountNumber provider userId")
  .lean();

console.log(`\nFound ${toActivate.length} BankAccount record(s) with status "pending".`);

if (toActivate.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

for (const acc of toActivate) {
  console.log(`  - [${acc.provider}] ${acc.accountName} (${acc.accountNumber}) userId=${acc.userId}`);
}

if (!apply) {
  console.log("\nDry run only — no changes made. Re-run with --apply to update these records.");
  process.exit(0);
}

const result = await BankAccount.updateMany(
  { status: "pending" },
  { $set: { status: "active" } }
);

console.log(`\n✅ Updated ${result.modifiedCount} record(s) to status: "active".`);
console.log("Note: this does not retroactively re-process deposits that already");
console.log("got flagged for review — those still need manual approval from the");
console.log("Flagged tab. This only fixes matching for future incoming transactions.");

process.exit(0);
