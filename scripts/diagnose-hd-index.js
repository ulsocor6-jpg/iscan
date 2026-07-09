/**
 * scripts/diagnose-hd-index.js
 * -----------------------------
 * READ-ONLY. Checks whether a user's chain address (e.g. their BASE deposit
 * address) has a backing DepositAddress record with an hdIndex. This is
 * what flowerSweepServiceBase.js needs to derive the private key and sweep
 * a deposit — if it's missing, every sweep from that address will fail
 * with "No HD index found for address ...".
 *
 * Usage:
 *   node scripts/diagnose-hd-index.js <userId> [chain]   # chain defaults to BASE
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Wallet from '../src/models/walletModel.js';
import DepositAddress from '../src/models/depositAddressModel.js';

const userId = process.argv[2];
const chain  = (process.argv[3] || 'BASE').toUpperCase();

if (!userId) {
  console.error('Usage: node scripts/diagnose-hd-index.js <userId> [chain]');
  process.exit(1);
}

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
    console.log(`Wallet has no ${chain} chainAddresses entry at all.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Wallet.chainAddresses[${chain}] = ${chainEntry.address}`);

  // Check every casing DepositAddress might have been written with, so we
  // can tell a genuinely-missing record apart from a case-mismatch bug.
  const candidates = await DepositAddress.find({
    address: { $regex: new RegExp(`^${chainEntry.address}$`, 'i') }
  });

  if (candidates.length === 0) {
    console.log(
      `\nNo DepositAddress record exists for ${chainEntry.address} under ANY casing.\n` +
      `This address predates the DepositAddress/hdIndex tracking system, or was created ` +
      `through a path that never wrote one. It needs to be backfilled before any sweep ` +
      `from it can ever succeed — there is currently no way to derive its private key.`
    );
  } else {
    for (const rec of candidates) {
      console.log(
        `\nFound DepositAddress record: chain="${rec.chain}" hdIndex=${rec.hdIndex} status=${rec.status}`
      );
      if (rec.chain !== chain.toLowerCase()) {
        console.log(`  -> NOTE: stored chain value "${rec.chain}" does not match expected "${chain.toLowerCase()}" (case/value mismatch)`);
      }
      if (rec.hdIndex == null) {
        console.log(`  -> hdIndex is null — this record exists but was never assigned a derivation index.`);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
