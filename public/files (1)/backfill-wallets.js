/**
 * BACKFILL SCRIPT — run once after deploying the fix
 *
 * Creates wallet records for any existing users who registered before
 * authController.js was fixed. Safe to run multiple times (upsert).
 *
 * Usage:
 *   node scripts/backfill-wallets.js
 */

import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../config/db.js';
import User from '../src/models/userModel.js';
import Wallet from '../src/models/walletModel.js';

async function backfill() {
  await connectDB();

  const users = await User.find({}, '_id email');
  console.log(`Found ${users.length} users to check.`);

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const existing = await Wallet.findOne({ userId: user._id });
    if (existing) {
      skipped++;
      continue;
    }
    await Wallet.create({ userId: user._id, balance: 0 });
    console.log(`  Created wallet for ${user.email}`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Already had wallet: ${skipped}`);
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
