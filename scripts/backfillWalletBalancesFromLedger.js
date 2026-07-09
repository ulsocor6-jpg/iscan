/**
 * scripts/backfillWalletBalancesFromLedger.js
 * --------------------------------------------
 * One-time migration to run BEFORE deploying the new atomic
 * walletService.js. It recomputes every user's per-asset balance from
 * the existing Ledger history (credit sum - debit sum) and writes it
 * into Wallet.balances, which the new debit()/credit() code treats as
 * the authoritative, atomically-updated balance.
 *
 * Safe to re-run (idempotent) - it always recalculates from Ledger truth
 * and overwrites, it never increments. Run it once, confirm the report
 * looks sane, then deploy the new walletService.js. Do NOT deploy the
 * new walletService.js first and backfill after - every user would see
 * a $0 balance and every debit would fail as "insufficient" in between.
 *
 * Usage:
 *   node scripts/backfillWalletBalancesFromLedger.js            # apply
 *   node scripts/backfillWalletBalancesFromLedger.js --dry-run  # report only, no writes
 *
 * Requires: MONGODB_URI in the environment (same as the app).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Wallet from '../src/models/walletModel.js';
import Ledger from '../src/models/ledgerModel.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set.');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}`);

  // Sum credit/debit per (userId, currency) across the entire Ledger.
  const sums = await Ledger.aggregate([
    {
      $group: {
        _id: { userId: '$userId', currency: '$currency' },
        credit: { $sum: { $ifNull: ['$credit', 0] } },
        debit: { $sum: { $ifNull: ['$debit', 0] } },
      },
    },
  ]);

  console.log(`Found ${sums.length} (user, asset) ledger balances to reconcile.`);

  const byUser = new Map();
  for (const row of sums) {
    const userId = String(row._id.userId);
    const asset = row._id.currency;
    const balance = Math.max(0, row.credit - row.debit);
    if (!byUser.has(userId)) byUser.set(userId, {});
    byUser.get(userId)[asset] = balance;
  }

  let updated = 0;
  let mismatches = 0;
  let missingWallets = 0;

  for (const [userId, assetBalances] of byUser.entries()) {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      missingWallets += 1;
      console.warn(`  [SKIP] No wallet document for userId=${userId} (has Ledger history but no Wallet - investigate separately).`);
      continue;
    }

    const setOps = {};
    let anyDrift = false;

    for (const [asset, ledgerBalance] of Object.entries(assetBalances)) {
      const cached = Number(wallet.balances?.get ? wallet.balances.get(asset) : wallet.balances?.[asset] || 0);
      if (cached !== ledgerBalance) {
        anyDrift = true;
        setOps[`balances.${asset}`] = ledgerBalance;
      }
    }

    if (!anyDrift) continue;

    mismatches += 1;
    console.log(`  [DRIFT] userId=${userId}`, setOps);

    if (!DRY_RUN) {
      await Wallet.updateOne({ userId }, { $set: setOps });
      updated += 1;
    }
  }

  console.log('---');
  console.log(`Users with ledger history checked: ${byUser.size}`);
  console.log(`Users with drift found: ${mismatches}`);
  console.log(`Users with no Wallet document: ${missingWallets}`);
  console.log(DRY_RUN ? 'Dry run complete - no writes made.' : `Wallets updated: ${updated}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
