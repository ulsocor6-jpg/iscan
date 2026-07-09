/**
 * scripts/inspect-flower-order.js
 * --------------------------------
 * READ-ONLY. Prints everything about one FlowerOrder so you can see why
 * it's stuck (missing txHash, txHash that doesn't exist on-chain, not
 * enough confirmations yet, etc.) before deciding what to do about it.
 *
 * Usage:
 *   node scripts/inspect-flower-order.js <orderId>
 *   node scripts/inspect-flower-order.js FLW-8351f1c6
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import FlowerOrder from '../src/models/flower/flowerOrderModel.js';
import flowerConfig from '../config/flower.js';

const orderId = process.argv[2];
if (!orderId) {
  console.error('Usage: node scripts/inspect-flower-order.js <orderId>');
  process.exit(1);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const order = await FlowerOrder.findOne({ orderId }).lean();
  if (!order) {
    // The guard error message shows a Mongo _id-looking value sometimes -
    // also try matching against _id in case that's what was pasted in.
    const byMongoId = mongoose.isValidObjectId(orderId)
      ? await FlowerOrder.findById(orderId).lean()
      : null;
    if (!byMongoId) {
      console.log(`No FlowerOrder found with orderId or _id = "${orderId}"`);
      await mongoose.disconnect();
      return;
    }
    return printAndCheck(byMongoId);
  }

  await printAndCheck(order);
  await mongoose.disconnect();
}

async function printAndCheck(order) {
  console.log('--- Order ---');
  console.log(JSON.stringify(order, null, 2));

  if (!order.txHash) {
    console.log('\nNo txHash recorded yet - this order is still waiting for the watcher/manual ' +
      'confirm to see a matching on-chain transfer. Nothing to check on-chain yet.');
    return;
  }

  console.log(`\nChecking txHash ${order.txHash} on Ronin RPC...`);
  try {
    const provider = new ethers.JsonRpcProvider(flowerConfig.RONIN_RPC);
    const receipt = await provider.getTransactionReceipt(order.txHash);

    if (!receipt) {
      console.log('RESULT: No receipt found for this txHash on-chain. Either it never landed ' +
        '(e.g. a fabricated/test hash), or the RPC endpoint doesn\'t have it. This is why the ' +
        'order is stuck - the watcher will keep polling forever with nothing to confirm.');
      return;
    }

    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    console.log(`RESULT: Found on-chain. Block ${receipt.blockNumber}, current block ${currentBlock}, ` +
      `confirmations=${confirmations} (need ${flowerConfig.MIN_CONFIRMATIONS}).`);
    if (confirmations >= flowerConfig.MIN_CONFIRMATIONS) {
      console.log('Confirmations are already sufficient - the watcher should sweep this on its next poll.');
    } else {
      console.log(`Needs ${flowerConfig.MIN_CONFIRMATIONS - confirmations} more confirmation(s) - ` +
        'the watcher will pick it up automatically once mined further.');
    }
  } catch (err) {
    console.log(`RESULT: RPC call failed - ${err.message}`);
  }
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
