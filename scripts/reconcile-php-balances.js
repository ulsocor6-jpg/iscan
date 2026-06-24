// scripts/reconcile-php-balances.js
//
// Run this against your REAL database (read-only — makes no writes) to find:
//   1. Every user's true PHP balance vs their Wallet.balance cache
//   2. Any CashoutRequest where the cashout total exceeded the user's
//      true PHP-only ledger balance AT THE TIME (sign of the bug letting
//      a bad cashout through)
//   3. Users whose true PHP balance is negative (over-cashed-out)
//
// Usage:
//   node scripts/reconcile-php-balances.js
//
// Requires the same DB connection env vars your app already uses
// (checked via config/db.js / config/database.js — adjust the import
// below if your connection helper has a different export name).

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Ledger from '../src/models/ledgerModel.js';
import Wallet from '../src/models/walletModel.js';
import CashoutRequest from '../src/models/CashoutRequest.js';

// --- adjust this to however your app currently connects ---
import connectDB from '../config/db.js';

async function main() {
  await connectDB();
  console.log('[RECONCILE] Connected. Starting audit (read-only)...\n');

  // 1) True PHP balance per user, straight from the ledger
  const phpBalances = await Ledger.aggregate([
    { $match: { currency: 'PHP' } },
    {
      $group: {
        _id: '$userId',
        credit: { $sum: { $ifNull: ['$credit', 0] } },
        debit: { $sum: { $ifNull: ['$debit', 0] } },
      },
    },
    { $project: { truePhpBalance: { $subtract: ['$credit', '$debit'] } } },
  ]);

  const trueBalanceMap = new Map(
    phpBalances.map(b => [String(b._id), b.truePhpBalance])
  );

  // 2) Compare to cached Wallet.balance (the dashboard widget's source)
  const wallets = await Wallet.find({}).lean();
  const mismatches = [];
  const negativeBalances = [];

  for (const w of wallets) {
    const userId = String(w.userId);
    const truePhp = trueBalanceMap.get(userId) || 0;
    const cachedPhp = w.balances?.get
      ? w.balances.get('PHP') || 0
      : (w.balances?.PHP || 0);

    if (Math.abs(truePhp - cachedPhp) > 0.01) {
      mismatches.push({ userId, truePhp, cachedPhp, diff: +(truePhp - cachedPhp).toFixed(2) });
    }
    if (truePhp < -0.01) {
      negativeBalances.push({ userId, truePhp });
    }
  }

  console.log(`[RECONCILE] Users with PHP cache mismatch (dashboard vs true ledger): ${mismatches.length}`);
  mismatches.slice(0, 20).forEach(m =>
    console.log(`  userId=${m.userId}  true=₱${m.truePhp.toFixed(2)}  cached=₱${m.cachedPhp.toFixed(2)}  diff=₱${m.diff}`)
  );

  console.log(`\n[RECONCILE] Users with NEGATIVE true PHP balance (over-cashed-out): ${negativeBalances.length}`);
  negativeBalances.forEach(n =>
    console.log(`  userId=${n.userId}  true=₱${n.truePhp.toFixed(2)}  <-- investigate, may need manual hold/contact`)
  );

  // 3) Check each historical CashoutRequest against the user's PHP-only
  //    balance reconstructed at that point in time (entries created
  //    strictly before the cashout's createdAt).
  console.log(`\n[RECONCILE] Re-validating historical cashouts against true PHP-only balance at time of request...`);

  const cashouts = await CashoutRequest.find({}).sort({ createdAt: 1 }).lean();
  const suspectCashouts = [];

  for (const co of cashouts) {
    const userId = co.userId;
    const phpEntriesBefore = await Ledger.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          currency: 'PHP',
          createdAt: { $lt: co.createdAt },
        },
      },
      {
        $group: {
          _id: null,
          c: { $sum: { $ifNull: ['$credit', 0] } },
          d: { $sum: { $ifNull: ['$debit', 0] } },
        },
      },
    ]);
    const phpBalanceAtTime = phpEntriesBefore.length ? phpEntriesBefore[0].c - phpEntriesBefore[0].d : 0;
    const requiredTotal = co.amount * 1.015; // matches the 1.5% fee in paymentRoutes.js

    if (phpBalanceAtTime < requiredTotal - 0.01) {
      suspectCashouts.push({
        cashoutId: co._id,
        userId: String(userId),
        amount: co.amount,
        requiredTotal: +requiredTotal.toFixed(2),
        truePhpAtTime: +phpBalanceAtTime.toFixed(2),
        shortfall: +(requiredTotal - phpBalanceAtTime).toFixed(2),
        createdAt: co.createdAt,
        status: co.status,
      });
    }
  }

  console.log(`\n[RECONCILE] Cashouts that should NOT have been approved (insufficient true PHP at the time): ${suspectCashouts.length}`);
  suspectCashouts.forEach(s =>
    console.log(
      `  cashoutId=${s.cashoutId}  userId=${s.userId}  amount=₱${s.amount}  ` +
      `required=₱${s.requiredTotal}  truePHP=₱${s.truePhpAtTime}  shortfall=₱${s.shortfall}  ` +
      `status=${s.status}  date=${s.createdAt.toISOString()}`
    )
  );

  console.log('\n[RECONCILE] Done. No writes were made — this is a read-only audit.');
  console.log('Review suspectCashouts and negativeBalances before deciding on remediation (e.g. holds, manual top-ups, or contacting affected users).');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[RECONCILE ERROR]', err);
  process.exit(1);
});
