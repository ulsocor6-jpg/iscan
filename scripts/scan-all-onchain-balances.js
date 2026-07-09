// scripts/scan-all-onchain-balances.js
//
// READ-ONLY. Makes no writes, sends no transactions.
//
// Scans every user's wallet across every configured chain (currently
// Base, Ronin — see onchainBalanceService.js) for real on-chain token/
// native balances. Run this BEFORE any send/swap functionality testing,
// and BEFORE deleting any wallet — if a wallet shows a nonzero balance
// here, that's real money sitting at a real address that needs to be
// swept to treasury first, not deleted.
//
// Usage:
//   node scripts/scan-all-onchain-balances.js

import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../config/db.js';
import Wallet from '../src/models/walletModel.js';
import { getLiveBalancesForWallet } from '../src/services/onchainBalanceService.js';

function hasAnyValue(chainData) {
  if (!chainData || chainData.error) return false;
  return Object.entries(chainData).some(
    ([key, val]) => key !== 'address' && typeof val === 'number' && val > 0
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLiveBalancesWithRetry(wallet, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await getLiveBalancesForWallet(wallet);
    const rateLimited = Object.values(result).some(
      (d) => d.error && /too many requests/i.test(d.error)
    );
    if (!rateLimited) return result;
    if (attempt < retries) {
      console.log(`\n[SCAN] Rate limited, backing off ${attempt * 2}s before retry ${attempt + 1}/${retries}...`);
      await sleep(attempt * 2000);
    } else {
      return result; // give up, return whatever we got (will show as errors)
    }
  }
}

async function main() {
  await connectDB();
  console.log('[SCAN] Connected. Scanning all wallets for real on-chain balances (read-only)...\n');

  const wallets = await Wallet.find({}).lean();
  console.log(`[SCAN] ${wallets.length} wallet documents found. Processing one at a time to respect RPC rate limits — this will take a few minutes.\n`);

  const flagged = [];
  const errors = [];

  // Fully sequential, with a pause between each wallet, to stay well under
  // public RPC free-tier rate limits (Ronin's especially is tight).
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    try {
      const onchain = await getLiveBalancesWithRetry(wallet);
      for (const [chain, data] of Object.entries(onchain)) {
        if (data.error) {
          errors.push({ userId: String(wallet.userId), chain, address: data.address, error: data.error });
        } else if (hasAnyValue(data)) {
          flagged.push({ userId: String(wallet.userId), iscanAddress: wallet.iscanAddress, chain, ...data });
        }
      }
    } catch (err) {
      errors.push({ userId: String(wallet.userId), error: err.message });
    }
    process.stdout.write(`\r[SCAN] Progress: ${i + 1}/${wallets.length}`);
    await sleep(800); // brief pause between wallets regardless of outcome
  }
  console.log('\n');

  if (flagged.length === 0) {
    console.log('[SCAN] No wallets found with any real on-chain balance. Safe to proceed with testing/cleanup.');
  } else {
    console.log(`[SCAN] ⚠ ${flagged.length} chain-balance(s) found with real value — DO NOT DELETE these wallets yet:\n`);
    for (const f of flagged) {
      console.log(
        `  userId=${f.userId}  iscanAddress=${f.iscanAddress}  chain=${f.chain}  address=${f.address}`
      );
      for (const [key, val] of Object.entries(f)) {
        if (['userId', 'iscanAddress', 'chain', 'address'].includes(key)) continue;
        if (typeof val === 'number' && val > 0) console.log(`      ${key}: ${val}`);
      }
    }
  }

  if (errors.length > 0) {
    const errorsByChain = {};
    for (const e of errors) {
      const key = e.chain || 'unknown';
      errorsByChain[key] = (errorsByChain[key] || 0) + 1;
    }
    console.log(`\n[SCAN] ${errors.length} chain lookup(s) failed (RPC timeout/rate-limit/error):`);
    for (const [chain, count] of Object.entries(errorsByChain)) {
      console.log(`  ${chain}: ${count} failed lookups`);
    }
    console.log(
      '\n[SCAN] ⚠ IMPORTANT: a failed lookup is NOT the same as a confirmed-zero balance.' +
      '\n         Any wallet with failed lookups above has NOT been verified — re-run this script' +
      '\n         until every wallet resolves cleanly before treating any wallet as safe to delete.'
    );
  }

  console.log('\n[SCAN] Done. No writes were made — this is a read-only audit.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[SCAN] Fatal error:', err);
  process.exit(1);
});
