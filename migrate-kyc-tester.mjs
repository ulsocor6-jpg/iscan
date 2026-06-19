/**
 * migrate-kyc-tester.mjs
 * ─────────────────────────────────────────────────────────────
 * One-time script: marks your tester account as fully verified
 * so you're never locked out during development.
 *
 * Usage:
 *   node migrate-kyc-tester.mjs your@email.com
 *
 * Or to mark ALL existing users as 'full' (dev mode):
 *   node migrate-kyc-tester.mjs --all
 */

import dotenv    from 'dotenv';
import mongoose  from 'mongoose';
import User      from './src/models/userModel.js';

dotenv.config();

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node migrate-kyc-tester.mjs your@email.com');
  console.error('       node migrate-kyc-tester.mjs --all');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
console.log('MongoDB connected');

if (arg === '--all') {
  // Mark all existing users as full (useful for existing test accounts)
  const result = await User.updateMany(
    { kycTier: { $exists: false } },
    { $set: { kycTier: 'full' } }
  );
  console.log(`✅ Marked ${result.modifiedCount} existing users as kycTier=full`);
} else {
  // Mark specific email as full
  const user = await User.findOneAndUpdate(
    { email: arg },
    { $set: { kycTier: 'full' } },
    { new: true }
  );
  if (!user) {
    console.error(`❌ User not found: ${arg}`);
    process.exit(1);
  }
  console.log(`✅ ${user.email} → kycTier=full`);
}

await mongoose.disconnect();
process.exit(0);
