// src/services/reconciliationService.js
//
// Compares the platform's internal ledger balance (Wallet.balances / Ledger
// aggregate - these two are always in sync, see walletService.js) against
// the REAL on-chain balance for stablecoins that are meant to be backed by
// an actual on-chain deposit (USDC/USDT).
//
// This is read-only. It never mutates anything - scripts/reconcile-balance.js
// is the only place that writes a correction, and only after a human
// explicitly runs it with --confirm.
//
// NOTE: this file previously contained a different, unused implementation
// referencing `../models/ledger/ledgerEntryModel.js`, a model that doesn't
// exist anywhere in this codebase, and `wallet.balance` (singular), which
// isn't a field on the current Wallet schema (`balances` is a Map). Nothing
// imported the old version, so it was dead code that would have thrown
// immediately on import. Replaced with a version built on the schema this
// app actually uses (walletService.js / Ledger / Wallet.balances).

import Wallet from '../models/walletModel.js';
import walletService from './walletService.js';
import { getAllBalancesForAddress, SUPPORTED_LIVE_CHAINS } from './onchainBalanceService.js';

const TRACKED_CURRENCIES = ['USDC', 'USDT'];
const EPSILON = 1e-6; // floating point tolerance

// Sums on-chain balance for `currency` across every chain address on the
// wallet that actually supports that token (a user can hold USDC on more
// than one chain - e.g. Base and Ronin - against a single ledger balance).
export async function getOnChainTotal(wallet, currency) {
  let total = 0;
  const perChain = {};

  for (const ca of wallet.chainAddresses || []) {
    const chainKey = ca.chain?.toUpperCase();
    if (!chainKey || !SUPPORTED_LIVE_CHAINS.includes(chainKey) || !ca.address) continue;

    try {
      const balances = await getAllBalancesForAddress(chainKey, ca.address);
      const amount = balances[currency];
      if (typeof amount === 'number') {
        total += amount;
        perChain[chainKey] = amount;
      }
    } catch (err) {
      perChain[chainKey] = { error: err.message };
    }
  }

  return { total, perChain };
}

// Full report for one user across all tracked currencies.
export async function reconcileUser(userId) {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) return null;

  const results = [];
  for (const currency of TRACKED_CURRENCIES) {
    const ledgerBalance = await walletService.getBalance(userId, currency);
    const { total: onChainBalance, perChain } = await getOnChainTotal(wallet, currency);
    const drift = ledgerBalance - onChainBalance;

    results.push({
      currency,
      ledgerBalance,
      onChainBalance,
      perChain,
      drift,
      // Positive drift = ledger claims more than the chain can back (the
      // dangerous direction - this is what phpSettlementService's guard
      // catches at swap time). Negative drift = chain has more than the
      // ledger credits (funds sitting unswept/uncredited - not dangerous,
      // but worth investigating separately; never auto-corrected here).
      status: Math.abs(drift) < EPSILON ? 'in_sync'
            : drift > 0 ? 'ledger_ahead_of_chain'
            : 'chain_ahead_of_ledger',
    });
  }

  return { userId: String(userId), iscanAddress: wallet.iscanAddress, results };
}

// Report across every wallet. Runs sequentially (not Promise.all) on purpose -
// this hits live RPCs per chain per user, and fanning that out unbounded
// across every user is how you get your RPC provider rate-limited.
export async function reconcileAllUsers({ onlyMismatches = false } = {}) {
  const wallets = await Wallet.find({}, { userId: 1 });
  const reports = [];

  for (const w of wallets) {
    try {
      const report = await reconcileUser(w.userId);
      if (!report) continue;
      const hasMismatch = report.results.some(r => r.status !== 'in_sync');
      if (!onlyMismatches || hasMismatch) reports.push(report);
    } catch (err) {
      reports.push({ userId: String(w.userId), error: err.message });
    }
  }

  return reports;
}

export default { reconcileUser, reconcileAllUsers, getOnChainTotal };
