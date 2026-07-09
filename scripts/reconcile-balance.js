/**
 * scripts/reconcile-balance.js
 * ----------------------------
 * Compares one user's ledger balance for a currency against their REAL
 * on-chain balance, and — only if the ledger claims MORE than the chain can
 * back — writes a compensating debit so the ledger matches reality.
 *
 * This only ever corrects the dangerous direction (ledger_ahead_of_chain).
 * If the chain actually has MORE than the ledger credits (chain_ahead_of_
 * ledger), this script refuses to touch it — that likely means a deposit
 * landed on-chain but was never credited through the normal deposit/sweep
 * flow, and creditinig it here without knowing why bypasses whatever check
 * usually would have caught it. Investigate that case manually instead.
 *
 * Defaults to a dry run - it only prints what it would do. Nothing is
 * written unless you pass --confirm.
 *
 * Usage:
 *   node scripts/reconcile-balance.js <userId> <currency>                 # dry run
 *   node scripts/reconcile-balance.js <userId> <currency> --confirm        # actually writes
 *
 * Example:
 *   node scripts/reconcile-balance.js 6a2b546bad9ae11f2f193a7f USDC --confirm
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import walletService from '../src/services/walletService.js';
import { reconcileUser } from '../src/services/reconciliationService.js';

const userId = process.argv[2];
const currency = process.argv[3];
const CONFIRM = process.argv.includes('--confirm');

if (!userId || !currency) {
  console.error('Usage: node scripts/reconcile-balance.js <userId> <currency> [--confirm]');
  console.error('Example: node scripts/reconcile-balance.js 6a2b546bad9ae11f2f193a7f USDC --confirm');
  process.exit(1);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const report = await reconcileUser(userId);
  if (!report) {
    console.log(`No wallet found for user ${userId}`);
    await mongoose.disconnect();
    return;
  }

  const entry = report.results.find(r => r.currency === currency.toUpperCase());
  if (!entry) {
    console.log(`"${currency}" isn't a tracked currency for reconciliation (tracked: USDC, USDT).`);
    await mongoose.disconnect();
    return;
  }

  console.log(`User: ${userId} (${report.iscanAddress})`);
  console.log(`Currency: ${entry.currency}`);
  console.log(`Ledger balance:   ${entry.ledgerBalance}`);
  console.log(`On-chain balance: ${entry.onChainBalance}`);
  console.log(`Per-chain detail:`, JSON.stringify(entry.perChain, null, 2));
  console.log(`Status: ${entry.status}`);

  if (entry.status === 'in_sync') {
    console.log('\nAlready in sync — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (entry.status === 'chain_ahead_of_ledger') {
    console.log(
      '\nOn-chain balance is HIGHER than the ledger. This script does not auto-credit this ' +
      'direction — investigate why a real on-chain balance was never credited (a missed deposit ' +
      'event, a failed sweep credit, etc.) before deciding whether to manually credit it.'
    );
    await mongoose.disconnect();
    return;
  }

  const diff = +(entry.drift.toFixed(6));
  console.log(`\n${CONFIRM ? 'WILL DEBIT' : 'Would debit (dry run)'} ${diff} ${entry.currency} to bring the ledger down to the on-chain amount.`);

  if (!CONFIRM) {
    console.log('\nNo changes made. Re-run with --confirm to apply.');
    await mongoose.disconnect();
    return;
  }

  await walletService.debit(userId, entry.currency, diff, {
    transactionType: 'adjustment',
    description: `Reconciliation: ledger claimed ${entry.ledgerBalance} ${entry.currency} but on-chain balance is only ${entry.onChainBalance}`,
  });

  console.log(`\nDone. ${entry.currency} ledger balance for ${userId} corrected to ${entry.onChainBalance}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
