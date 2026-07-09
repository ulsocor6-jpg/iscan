// PATH: ~/Desktop/iscansystem/scripts/backfill-missing-ledger-entries.js
//
// One-time fix for deposits processed under the old buggy walletCreditWorker.js,
// which mistakenly set workers.ledger.done = true instead of workers.wallet.done.
// Those jobs already credited the user's wallet correctly, but ledgerWorker.js
// never picked them up (it waits on workers.wallet.done === true), so no Ledger
// entry — and therefore no Activity/transaction history entry — was ever created.
//
// This script finds those stuck jobs and creates their missing Ledger entries
// directly, without re-crediting the wallet (which already happened).
//
// Run once, after deploying the walletCreditWorker.js fix:
//   node scripts/backfill-missing-ledger-entries.js

import "dotenv/config";
import mongoose from "mongoose";
import BlockchainInbox from "../src/models/blockchain/blockchainInboxModel.js";
import Ledger from "../src/models/ledgerModel.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Jobs that got a wallet credit (creditedAt is set) but never made it
  // into Ledger — the tell-tale sign of the old bug.
  const stuckJobs = await BlockchainInbox.find({
    creditedAt: { $ne: null },
    status: "PROCESSED"
  });

  console.log(`Found ${stuckJobs.length} credited job(s) to check.\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of stuckJobs) {

    try {

      const exists = await Ledger.findOne({
        referenceId: job.txHash
      });

      if (exists) {
        skipped++;
        continue;
      }

      await Ledger.create({
        userId: job.watch.userId,
        referenceId: job.txHash,
        transactionType: "crypto_deposit",
        currency: job.token,
        credit: Number(job.value),
        debit: 0,
        description: `Crypto deposit: ${job.value} ${job.token} on ${job.chain}`,
        counterpartyAddress: job.to,
        metadata: {
          chain: job.chain,
          blockNumber: job.blockNumber,
          confirmations: job.confirmations,
          backfilled: true
        }
      });

      // Correct the flags going forward so this job reads as fully done.
      job.workers.wallet.done = true;
      job.workers.ledger.done = true;
      job.currentStage = "DashboardWorker";
      await job.save();

      created++;

      console.log(`✓ Created Ledger entry for ${job.txHash} (${job.value} ${job.token})`);

    } catch (err) {

      failed++;
      console.error(`✗ Failed for ${job.txHash}: ${err.message}`);

    }

  }

  console.log(`\nDone. Created: ${created}, Already existed: ${skipped}, Failed: ${failed}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
