import 'dotenv/config';
import mongoose from 'mongoose';
import Ledger from './src/models/ledgerModel.js';
import Transaction from './src/models/transactionModel.js';

await mongoose.connect(process.env.MONGODB_URI);

const ref = process.argv[2];

if (!ref) {
  console.log("Usage:");
  console.log("node check-ledger.mjs <referenceId>");
  process.exit(1);
}

console.log("\n==========================");
console.log("LEDGER");
console.log("==========================");

const ledgerRows = await Ledger.find({
  referenceId: ref
}).sort({ createdAt: 1 });

console.log(JSON.stringify(ledgerRows, null, 2));

console.log("\nLedger rows:", ledgerRows.length);

console.log("\n==========================");
console.log("TRANSACTION");
console.log("==========================");

const tx = await Transaction.findOne({
  referenceId: ref
});

console.log(JSON.stringify(tx, null, 2));

await mongoose.disconnect();
