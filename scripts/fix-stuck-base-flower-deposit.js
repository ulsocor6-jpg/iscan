/**
 * scripts/fix-stuck-base-flower-deposit.js
 * ------------------------------------------
 * One-off recovery for the e5aec83f-... / 0xa6fe9e08... incident:
 *
 * 1. BlockchainInbox job for txHash 0xa6fe9e08caafccc4f734ffbb6f598e11e94f064be88ce54b00f76e19d0e14cbc
 *    was mis-tagged chain="ronin" by the decoder address collision bug
 *    (FLOWER shares one contract address across Ronin and Base). The real
 *    chain is "base" (job.watch.chain is correct). This corrects job.chain
 *    so flowerInboxWorker's getAdapter() call — even pre-Fix-#3 — resolves
 *    to the right adapter.
 *
 * 2. FlowerOrder e5aec83f-9b80-4e6b-bdff-aa83025719e2 was manually/out-of-band
 *    set to DEPOSIT_RECEIVED with receivedAmount=2 but no txHash — a state
 *    flowerInboxWorker's order lookup (status IN [WAITING_DEPOSIT, CREATED])
 *    can never match. This resets it to WAITING_DEPOSIT with receivedAmount=0
 *    so the corrected pipeline can pick it up cleanly from the real on-chain
 *    event instead of the stale manual state.
 *
 * IMPORTANT: the user's wallet was ALREADY credited 2 FLOWER as a generic
 * deposit (workers.wallet.done=true, workers.ledger.done=true on this job).
 * This script does NOT touch Wallet/Ledger. If flowerInboxWorker successfully
 * sweeps+swaps this same deposit after reset, verify there is no double-credit
 * before settling — inspect wallet balance and ledger entries for this user
 * first if unsure.
 *
 * Defaults to dry run. Nothing is written unless you pass --confirm.
 *
 * Usage:
 *   node scripts/fix-stuck-base-flower-deposit.js                # dry run
 *   node scripts/fix-stuck-base-flower-deposit.js --confirm       # writes
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import BlockchainInbox from '../src/models/blockchain/blockchainInboxModel.js';
import FlowerOrder from '../src/models/flower/flowerOrderModel.js';

const TX_HASH = '0xa6fe9e08caafccc4f734ffbb6f598e11e94f064be88ce54b00f76e19d0e14cbc';
const ORDER_ID = 'e5aec83f-9b80-4e6b-bdff-aa83025719e2';
const CONFIRM = process.argv.includes('--confirm');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected\n');

  // --- Step 1: inspect + fix the inbox job's chain tag ---
  const job = await BlockchainInbox.findOne({ txHash: TX_HASH });
  if (!job) {
    console.log(`No BlockchainInbox job found with txHash=${TX_HASH}`);
  } else {
    console.log('Current inbox job:');
    console.log(`  chain (top-level, WRONG): ${job.chain}`);
    console.log(`  watch.chain (correct):    ${job.watch?.chain}`);
    console.log(`  status: ${job.status}, currentStage: ${job.currentStage}`);
    console.log(`  workers: ${JSON.stringify(job.workers)}`);

    const chainNeedsFix = job.chain !== job.watch?.chain && job.watch?.chain;
    // This job's status was written to "PROCESSED" by the pre-fix version of
    // depositProcessor.js (which overwrote status instead of only advancing
    // currentStage). flowerInboxWorker requires status="CONFIRMED" to pick a
    // job up at all. The depositProcessor fix stops this happening to FUTURE
    // jobs, but does not retroactively repair jobs already written before the
    // fix landed — this job needs status manually restored to CONFIRMED, or
    // flowerInboxWorker will never select it regardless of the chain fix.
    const statusNeedsFix = job.status === 'PROCESSED' && job.workers?.flower?.done !== true;

    if (!chainNeedsFix && !statusNeedsFix) {
      console.log('  Nothing to fix on this job.');
    } else {
      if (chainNeedsFix) {
        console.log(`\n${CONFIRM ? 'WILL SET' : 'Would set (dry run)'} job.chain = "${job.watch.chain}"`);
      }
      if (statusNeedsFix) {
        console.log(`${CONFIRM ? 'WILL SET' : 'Would set (dry run)'} job.status = "CONFIRMED" (currently "${job.status}", stuck there by the pre-fix depositProcessor bug)`);
      }
      if (CONFIRM) {
        if (chainNeedsFix) job.chain = job.watch.chain;
        if (statusNeedsFix) job.status = 'CONFIRMED';
        await job.save();
        console.log('  Done.');
      }
    }
  }

  console.log('');

  // --- Step 2: inspect + reset the stuck FlowerOrder ---
  const order = await FlowerOrder.findOne({ orderId: ORDER_ID });
  if (!order) {
    console.log(`No FlowerOrder found with orderId=${ORDER_ID}`);
  } else {
    console.log('Current order state:');
    console.log(JSON.stringify(order.toObject(), null, 2));

    if (order.status !== 'DEPOSIT_RECEIVED' || order.txHash) {
      console.log('\nOrder is not in the expected stale state (status != DEPOSIT_RECEIVED or txHash already set) — refusing to touch it. Investigate manually.');
    } else if (order.sweepTxHash || order.swapTxHash) {
      console.log('\nWARNING: order has sweepTxHash/swapTxHash set — funds may already be in motion. Refusing to reset. Investigate manually.');
    } else {
      console.log(`\n${CONFIRM ? 'WILL RESET' : 'Would reset (dry run)'} order to status=WAITING_DEPOSIT, receivedAmount=0, txHash=null`);
      console.log('(so flowerInboxWorker can pick it up cleanly once the corrected inbox job is processed)');
      if (CONFIRM) {
        order.status = 'WAITING_DEPOSIT';
        order.receivedAmount = 0;
        order.txHash = undefined;
        await order.save();
        console.log('  Done.');
      }
    }
  }

  if (!CONFIRM) {
    console.log('\nNo changes made. Re-run with --confirm to apply.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
