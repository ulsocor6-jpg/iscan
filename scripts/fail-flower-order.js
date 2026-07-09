/**
 * scripts/fail-flower-order.js
 * ------------------------------
 * Marks a single stuck FlowerOrder as FAILED, which releases the deposit
 * address (flowerOrderGuard only blocks on ACTIVE_STATUSES - FAILED isn't
 * one of them) so the user can start a new swap.
 *
 * Defaults to a dry run - it only prints what it would do. Nothing is
 * written unless you pass --confirm.
 *
 * This does NOT touch any balance/ledger entry - if the user's balance was
 * never credited for this order (which is the normal case for an order
 * that never got past DEPOSIT_RECEIVED), failing it is safe. If you're
 * unsure whether a credit already happened for this order, run
 * inspect-flower-order.js first and check for a receivedAmount / sweepTxHash
 * / swapTxHash before failing it.
 *
 * Usage:
 *   node scripts/fail-flower-order.js <orderId> "reason"                 # dry run
 *   node scripts/fail-flower-order.js <orderId> "reason" --confirm        # actually writes
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import FlowerOrder from '../src/models/flower/flowerOrderModel.js';

const orderId = process.argv[2];
const reason = process.argv[3] || 'Manually failed - stuck order, never confirmed on-chain';
const CONFIRM = process.argv.includes('--confirm');

if (!orderId) {
  console.error('Usage: node scripts/fail-flower-order.js <orderId> "reason" [--confirm]');
  process.exit(1);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const order = await FlowerOrder.findOne({ orderId });
  if (!order) {
    console.log(`No FlowerOrder found with orderId = "${orderId}"`);
    await mongoose.disconnect();
    return;
  }

  console.log('Current order state:');
  console.log(JSON.stringify(order.toObject(), null, 2));

  if (order.status === 'COMPLETED') {
    console.log('\nThis order is already COMPLETED - refusing to touch it.');
    await mongoose.disconnect();
    return;
  }

  if (order.receivedAmount > 0 && !order.sweepTxHash) {
    console.log('\nWARNING: this order has a nonzero receivedAmount but no sweepTxHash - meaning ' +
      'a deposit was matched but never swept to treasury. Failing it here does NOT reverse or ' +
      'credit anything. If a real deposit happened, investigate the funds before failing this order.');
  }

  console.log(`\n${CONFIRM ? 'WILL SET' : 'Would set (dry run)'} status=FAILED, reason="${reason}"`);

  if (!CONFIRM) {
    console.log('\nNo changes made. Re-run with --confirm to apply.');
    await mongoose.disconnect();
    return;
  }

  order.status = 'FAILED';
  await order.save();

  console.log(`\nDone. Order ${orderId} is now FAILED - the deposit address is free for a new swap.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed to update order:', err);
  process.exit(1);
});
