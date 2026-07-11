// scripts/find_orphaned_deposits.js
// Finds PENDING DirectDeposits that have no corresponding active
// BankAccount for their channel — i.e. deposits created via the gap
// that existed before the NO_LINKED_ACCOUNT guard was added.
//
// Usage (from project root, ~/Desktop/iscansystem):
//   node scripts/find_orphaned_deposits.js
//
// Requires MONGODB_URI to be set in your project's .env file.

import 'dotenv/config';
import mongoose from 'mongoose';
import DirectDeposit from '../src/models/DirectDepositModel.js';
import BankAccount from '../src/models/BankAccount.js';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI is not set in the environment.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB. Scanning PENDING deposits...\n');

  const pending = await DirectDeposit.find({ status: 'PENDING' }).lean();
  console.log(`Found ${pending.length} PENDING deposit(s) total.\n`);

  const orphaned = [];

  for (const d of pending) {
    const provider = String(d.channel).toLowerCase();
    const acct = await BankAccount.findOne({
      userId: d.userId,
      provider,
      status: 'active',
    }).lean();

    if (!acct) {
      orphaned.push(d);
      console.log(
        `ORPHANED: ref=${d.referenceId}  user=${d.userId}  channel=${d.channel}  amount=₱${d.amount}  createdAt=${d.createdAt}`
      );
    }
  }

  console.log(`\n${orphaned.length} orphaned deposit(s) found out of ${pending.length} pending.`);

  if (orphaned.length > 0) {
    console.log('\nReference IDs (for admin/cancel):');
    console.log(orphaned.map((d) => d.referenceId).join(', '));
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
