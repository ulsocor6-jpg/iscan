/**
 * BACKFILL SCRIPT — run once after deploying the fix
 *
 * Creates wallet records for any existing users who registered before
 * authController.js was fixed. Safe to run multiple times.
 *
 * Usage:
 *   node scripts/backfill-wallets.js
 */

import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import connectDB from '../config/db.js';
import User from '../src/models/userModel.js';
import Wallet from '../src/models/walletModel.js';

// Generates a unique ISCAN address — same format you should use in walletService.createWallet()
function generateIscanAddress() {
  return 'ISCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function backfill() {
  await connectDB();

  const users = await User.find({}, '_id email');
  console.log(`Found ${users.length} users to check.`);

  let created = 0;
  let skipped = 0;
  let failed  = 0;

  for (const user of users) {
    try {
      const existing = await Wallet.findOne({ userId: user._id });
      if (existing) {
        skipped++;
        continue;
      }

      await Wallet.create({
        userId: user._id,
        balance: 0,
        iscanAddress: generateIscanAddress()  // unique per wallet — avoids the duplicate key error
      });

      console.log(`  ✓ Created wallet for ${user.email}`);
      created++;
    } catch (err) {
      console.error(`  ✗ Failed for ${user.email}:`, err.message);
      failed++;
    }
  }

  console.log(`\nDone. Created: ${created}  |  Already had wallet: ${skipped}  |  Failed: ${failed}`);
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
