/**
 * scripts/backfill-deposit-address.js
 * -------------------------------------
 * Creates the missing DepositAddress record for a legacy chain address that
 * predates DepositAddress/hdIndex tracking. Only run this with an index
 * that find-hd-index.js has already confirmed derives to the real address —
 * this script re-derives and double-checks before writing, so a mistyped
 * index gets rejected instead of silently creating a wrong mapping.
 *
 * Usage:
 *   node scripts/backfill-deposit-address.js <userId> <chain> <hdIndex>
 *   node scripts/backfill-deposit-address.js 6a2b546bad9ae11f2f193a7f BASE 42
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Wallet from '../src/models/walletModel.js';
import DepositAddress from '../src/models/depositAddressModel.js';
import { deriveBaseAddress, deriveRoninAddress } from '../src/services/hdWalletService.js';

const userId  = process.argv[2];
const chain   = (process.argv[3] || '').toUpperCase();
const hdIndex = parseInt(process.argv[4], 10);

if (!userId || !chain || Number.isNaN(hdIndex)) {
  console.error('Usage: node scripts/backfill-deposit-address.js <userId> <chain> <hdIndex>');
  process.exit(1);
}

const deriveFn = chain === 'RONIN' ? deriveRoninAddress : deriveBaseAddress;
const dbChain  = chain.toLowerCase();

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    console.log(`No wallet found for user ${userId}`);
    await mongoose.disconnect();
    return;
  }

  const chainEntry = wallet.chainAddresses.find(a => a.chain === chain);
  if (!chainEntry) {
    console.log(`Wallet has no ${chain} chainAddresses entry.`);
    await mongoose.disconnect();
    return;
  }

  const derived = await deriveFn(hdIndex);
  if (derived.address.toLowerCase() !== chainEntry.address.toLowerCase()) {
    console.error(
      `REFUSING TO WRITE: index ${hdIndex} derives to ${derived.address}, ` +
      `which does NOT match this wallet's stored address ${chainEntry.address}. ` +
      `Re-run scripts/find-hd-index.js to get the correct index — do not guess.`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const existing = await DepositAddress.findOne({
    address: { $regex: new RegExp(`^${chainEntry.address}$`, 'i') }
  });
  if (existing) {
    console.log(`A DepositAddress record already exists for this address (hdIndex=${existing.hdIndex}). Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  await DepositAddress.create({
    userId,
    chain: dbChain,
    address: chainEntry.address.toLowerCase(),
    hdIndex,
    token: '*',
    status: 'active'
  });

  console.log(
    `Done. Created DepositAddress for ${chainEntry.address} on ${dbChain} with hdIndex=${hdIndex}. ` +
    `Sweeps from this address should work now.`
  );
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
