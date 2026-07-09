// PATH: ~/Desktop/iscansystem/scripts/fix-raw-unit-amounts.js
//
// One-time fix for records created before the decimal-conversion bug
// in erc20TransferDecoder.js was fixed. Those records stored raw
// base-unit integers (e.g. 2000000000000000000 for 2 FLOWER at 18
// decimals) instead of human-readable amounts.
//
// This walks BlockchainInbox (which still has the correct `decimals`
// field recorded at detection time) and corrects the matching
// Deposit.amount and Ledger.credit values.
//
// Run once, after deploying the erc20TransferDecoder.js fix:
//   node scripts/fix-raw-unit-amounts.js

import "dotenv/config";
import mongoose from "mongoose";
import BlockchainInbox from "../src/models/blockchain/blockchainInboxModel.js";
import Deposit from "../src/models/depositModel.js";
import Ledger from "../src/models/ledgerModel.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Anything that looks like a raw base-unit integer rather than a
  // human-readable decimal amount — heuristic: value >= 10^12, which
  // no real deposit amount should ever be for these tokens.
  const suspects = await BlockchainInbox.find({
    decimals: { $gt: 0 },
  });

  console.log(`Checking ${suspects.length} inbox record(s) for raw-unit amounts.\n`);

  let fixed = 0;
  let skipped = 0;

  for (const job of suspects) {

    const rawValue = Number(job.value);

    // Skip if it already looks like a sane human amount.
    if (rawValue < 1e12) {
      skipped++;
      continue;
    }

    const correctedAmount = rawValue / Math.pow(10, job.decimals);

    console.log(
      `${job.txHash}: ${job.value} -> ${correctedAmount} ${job.token} (decimals=${job.decimals})`
    );

    const depositResult = await Deposit.updateOne(
      { txHash: job.txHash },
      { $set: { amount: String(correctedAmount) } }
    );

    const ledgerResult = await Ledger.updateOne(
      { referenceId: job.txHash },
      { $set: { credit: correctedAmount } }
    );

    console.log(
      `  Deposit matched=${depositResult.matchedCount} modified=${depositResult.modifiedCount}`
    );
    console.log(
      `  Ledger  matched=${ledgerResult.matchedCount} modified=${ledgerResult.modifiedCount}`
    );

    // Also correct the inbox record itself for consistency.
    job.value = String(correctedAmount);
    await job.save();

    fixed++;

  }

  console.log(`\nDone. Fixed: ${fixed}, Skipped (already correct): ${skipped}`);

  console.log(
    "\nNOTE: if any affected deposit already credited a Wallet balance " +
    "(usdcBalance/usdtBalance/balances Map) with the wrong raw amount, " +
    "that balance also needs manual correction — check case by case, " +
    "this script does not touch Wallet balances automatically."
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
