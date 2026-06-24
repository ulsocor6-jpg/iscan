// scripts/inspect-user.js
//
// Usage:
//   node scripts/inspect-user.js 6a2b546bad9ae11f2f193a7f

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Wallet from '../src/models/walletModel.js';
import Transaction from '../src/models/transactionModel.js';
import Ledger from '../src/models/ledgerModel.js';

const targetUserId = process.argv[2];

if (!targetUserId) {
  console.error('Usage: node scripts/inspect-user.js <userId>');
  process.exit(1);
}

async function main() {
  await connectDB();

  const userId = new mongoose.Types.ObjectId(targetUserId);

  const wallet = await Wallet.findOne({ userId }).lean();
  console.log('=== WALLET DOC ===');
  console.log(JSON.stringify(wallet, null, 2));

  const txs = await Transaction.find({
    $or: [{ senderId: userId }, { receiverId: userId }],
  }).lean();
  console.log('\n=== TRANSACTIONS ===');
  console.log('Count:', txs.length);
  console.log(JSON.stringify(txs, null, 2));

  const ledgerEntries = await Ledger.find({ userId }).lean();
  console.log('\n=== LEDGER ENTRIES (any currency) ===');
  console.log('Count:', ledgerEntries.length);
  console.log(JSON.stringify(ledgerEntries, null, 2));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[INSPECT ERROR]', err);
  process.exit(1);
});
