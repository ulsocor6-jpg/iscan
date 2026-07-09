// scripts/recover-settled-swaps.js
// One-off recovery for orders whose on-chain swap succeeded (real
// swapTxHash + usdcReceived present) but got mislabeled FAILED because
// settle() threw on a duplicate FeeRecord.referenceId (pre-fix bug).
// Safe to run after the flowerSettlementService.js idempotency patch is
// in place — settle() will skip any writes that already exist and only
// fill in whatever's actually missing.
//
// Usage: node scripts/recover-settled-swaps.js

import 'dotenv/config';
import mongoose from 'mongoose';
import FlowerOrder from '../src/models/flower/flowerOrderModel.js';
import { settle } from '../src/services/flower/flowerSettlementService.js';

const ORDER_IDS = [
  '8152c2ff-a3cb-4982-9b1f-4f24bc97732a',
  'af8076ae-281e-4692-aac7-614468e8cd7a'
];

async function main() {
  const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URL;
  await mongoose.connect(mongoUrl);
  console.log('MongoDB connected');

  for (const orderId of ORDER_IDS) {
    const order = await FlowerOrder.findOne({ orderId });
    if (!order) {
      console.warn(`[recover] ${orderId} — not found, skipping`);
      continue;
    }
    if (!order.swapTxHash || !order.usdcReceived) {
      console.warn(`[recover] ${orderId} — missing swapTxHash/usdcReceived, NOT safe to force-settle, skipping`);
      continue;
    }
    if (order.status === 'COMPLETED') {
      console.log(`[recover] ${orderId} — already COMPLETED, skipping`);
      continue;
    }

    console.log(`[recover] ${orderId} — forcing status SWAPPED so settle() will accept it`);
    await FlowerOrder.updateOne({ orderId }, { status: 'SWAPPED' });

    try {
      await settle(orderId);
      console.log(`[recover] ${orderId} — settle() completed successfully`);
    } catch (err) {
      console.error(`[recover] ${orderId} — settle() failed again:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
