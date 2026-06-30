// scripts/check-live-balance.js
//
// Usage:
//   node scripts/check-live-balance.js uls.ocor.7@gmail.com
//
// Looks up the user by email, finds their wallet's chainAddresses,
// and queries REAL on-chain balances (native + USDC/USDT) directly
// from each chain's RPC. No ledger, no cache — ground truth.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../src/models/userModel.js';
import Wallet from '../src/models/walletModel.js';
import { getLiveBalancesForWallet } from '../src/services/onchainBalanceService.js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/check-live-balance.js <email>');
  process.exit(1);
}

async function main() {
  await connectDB();

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }
  console.log(`User: ${user.firstName} ${user.lastName} (${user._id})`);

  const wallet = await Wallet.findOne({ userId: user._id }).lean();
  if (!wallet) {
    console.error('No wallet found for this user.');
    process.exit(1);
  }

  console.log('\nChain addresses:');
  (wallet.chainAddresses || []).forEach(ca =>
    console.log(`  ${ca.chain}: ${ca.address}`)
  );

  console.log('\nQuerying live on-chain balances (this calls real RPCs, may take a few seconds)...\n');
  const live = await getLiveBalancesForWallet(wallet);

  console.log('=== REAL ON-CHAIN BALANCES ===');
  for (const [chain, data] of Object.entries(live)) {
    if (data.error) {
      console.log(`${chain} (${data.address}): ERROR — ${data.error}`);
      continue;
    }
    const parts = [];
    if (data.native !== null) parts.push(`native=${data.native}`);
    if (data.USDC !== null && data.USDC !== undefined) parts.push(`USDC=${data.USDC}`);
    if (data.USDT !== null && data.USDT !== undefined) parts.push(`USDT=${data.USDT}`);
    console.log(`${chain} (${data.address}): ${parts.join('  ')}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[CHECK LIVE BALANCE ERROR]', err);
  process.exit(1);
});
