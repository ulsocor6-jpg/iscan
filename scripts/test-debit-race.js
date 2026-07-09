/**
 * scripts/test-debit-race.js
 * --------------------------
 * Regression test for the double-spend race condition in
 * walletService.debit(). Seeds a test user with a fixed balance, then
 * fires many concurrent debits that only add up to the exact balance
 * (plus one extra that should be rejected), and asserts:
 *   1. Exactly the expected number of debits succeed.
 *   2. The final balance is never negative.
 *   3. The Wallet.balances cache and the Ledger history agree (no drift).
 *
 * Run this against a disposable/test database only - it creates and
 * deletes a synthetic user+wallet+ledger rows under a fixed test userId.
 *
 * Usage:
 *   MONGODB_URI=<your test db uri> node scripts/test-debit-race.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Wallet from '../src/models/walletModel.js';
import Ledger from '../src/models/ledgerModel.js';
import walletService from '../src/services/walletService.js';

const TEST_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');
const ASSET = 'USDT';
const STARTING_BALANCE = 100;
const CONCURRENT_DEBITS = 11; // 10 x 10 = exactly the balance, +1 extra that must fail
const DEBIT_AMOUNT = 10;

async function cleanup() {
  await Wallet.deleteOne({ userId: TEST_USER_ID });
  await Ledger.deleteMany({ userId: TEST_USER_ID });
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  console.log('Cleaning up any previous test data...');
  await cleanup();

  console.log(`Seeding test wallet with ${STARTING_BALANCE} ${ASSET}...`);
  await walletService.getOrCreateWallet(TEST_USER_ID);
  await walletService.credit(TEST_USER_ID, ASSET, STARTING_BALANCE, {
    referenceId: 'TEST-SEED',
    description: 'race test seed balance',
  });

  console.log(`Firing ${CONCURRENT_DEBITS} concurrent debits of ${DEBIT_AMOUNT} ${ASSET} each ` +
    `(only ${STARTING_BALANCE / DEBIT_AMOUNT} should succeed)...`);

  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENT_DEBITS }, (_, i) =>
      walletService.debit(TEST_USER_ID, ASSET, DEBIT_AMOUNT, {
        referenceId: `TEST-DEBIT-${i}`,
        description: 'race test concurrent debit',
      })
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  const finalBalance = await walletService.getBalance(TEST_USER_ID, ASSET);
  const reconciliation = await walletService.reconcileBalance(TEST_USER_ID, ASSET);

  console.log('---');
  console.log(`Succeeded: ${succeeded} (expected ${STARTING_BALANCE / DEBIT_AMOUNT})`);
  console.log(`Rejected:  ${failed} (expected ${CONCURRENT_DEBITS - STARTING_BALANCE / DEBIT_AMOUNT})`);
  console.log(`Final cached balance: ${finalBalance} (expected 0)`);
  console.log('Reconciliation vs Ledger:', reconciliation);

  const expectedSuccesses = STARTING_BALANCE / DEBIT_AMOUNT;
  const pass =
    succeeded === expectedSuccesses &&
    finalBalance === 0 &&
    finalBalance >= 0 &&
    reconciliation.inSync;

  console.log(pass ? '\nPASS - no double-spend occurred, cache and ledger agree.' : '\nFAIL - see numbers above.');

  await cleanup();
  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Test crashed:', err);
  try { await cleanup(); await mongoose.disconnect(); } catch {}
  process.exit(1);
});
