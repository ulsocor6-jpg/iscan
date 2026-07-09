/**
 * scripts/list-flower-orders.js
 * ------------------------------
 * READ-ONLY. Lists the most recent FlowerOrders so you can find an orderId
 * to pass to inspect-flower-order.js / fail-flower-order.js without having
 * to scroll back through terminal output or logs.
 *
 * Usage:
 *   node scripts/list-flower-orders.js                # last 10 orders, any status
 *   node scripts/list-flower-orders.js 25              # last 25 orders
 *   node scripts/list-flower-orders.js 10 DEPOSIT_RECEIVED   # last 10 matching a status
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import FlowerOrder from '../src/models/flower/flowerOrderModel.js';

const limit  = parseInt(process.argv[2], 10) || 10;
const status = process.argv[3];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const query = status ? { status } : {};
  const orders = await FlowerOrder
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (orders.length === 0) {
    console.log(status ? `No orders with status=${status}` : 'No orders found');
  } else {
    console.log(`Most recent ${orders.length} order(s)${status ? ` with status=${status}` : ''}:\n`);
    for (const o of orders) {
      console.log(
        `${o.orderId}` +
        `  chain=${o.chain}` +
        `  status=${o.status}` +
        `  expected=${o.expectedAmount}` +
        `  received=${o.receivedAmount}` +
        `  usdcReceived=${o.usdcReceived ?? 0}` +
        `  created=${o.createdAt?.toISOString?.() ?? o.createdAt}` +
        (o.failureReason ? `\n    failureReason: ${o.failureReason}` : '')
      );
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Failed to list orders:', err);
  process.exit(1);
});
