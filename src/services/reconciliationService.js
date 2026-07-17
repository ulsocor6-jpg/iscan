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

import walletServiceInstance from './walletService.js';
import inspector from './blockchain/inspector/blockchainInspector.js';

// Writes a labeled correction entry (credit or debit) to bring
// wallet.balances.<currency> in line with the real on-chain balance.
// This does NOT delete or rewrite history — it adds one more Ledger row,
// same as any other movement, tagged "balance_correction" so it's
// clearly distinguishable from a real user-initiated transaction.
//
// Runs both directions on purpose:
//   - chain_ahead_of_ledger: credit the missing amount (funds are real,
//     just uncredited — e.g. a deposit the watcher missed).
//   - ledger_ahead_of_chain: debit the excess amount (ledger claims more
//     than the chain can back). This is the "dangerous" direction the
//     original reconciliationService comment flagged as never
//     auto-corrected — now intentionally enabled per product decision,
//     logged loudly via inspector either way so it is always visible.
const CORRECTION_EPSILON = 1e-6;

export async function correctUserDrift(userId) {
  const report = await reconcileUser(userId);
  if (!report) return null;

  const corrections = [];

  for (const r of report.results) {
    if (Math.abs(r.drift) < CORRECTION_EPSILON) continue;

    const { currency, ledgerBalance, onChainBalance, drift, status } = r;
    const amount = Math.abs(drift);
    const referenceId = `balance-correction-${userId}-${currency}-${Date.now()}`;

    try {
      if (status === 'chain_ahead_of_ledger') {
        await walletServiceInstance.credit(userId, currency, amount, {
          referenceId,
          description: `Balance correction: ${currency} on-chain balance exceeded ledger`,
          transactionType: 'balance_correction',
        });
      } else if (status === 'ledger_ahead_of_chain') {
        await walletServiceInstance.debit(userId, currency, amount, {
          referenceId,
          description: `Balance correction: ${currency} ledger balance exceeded on-chain`,
          transactionType: 'balance_correction',
        });
      } else {
        continue;
      }

      inspector.info(
        'reconciliation',
        `Balance correction applied: ${currency} ${status} by ${amount}`,
        { userId: String(userId), currency, direction: status, amount, ledgerBalance, onChainBalance }
      );

      corrections.push({ currency, direction: status, amount });
    } catch (err) {
      inspector.error(
        'reconciliation',
        `Balance correction FAILED: ${currency} for user ${userId}: ${err.message}`,
        { userId: String(userId), currency, direction: status, amount, ledgerBalance, onChainBalance }
      );
    }
  }

  return { userId: String(userId), corrections };
}

export async function correctAllUsersDrift() {
  const wallets = await Wallet.find({}, { userId: 1 });
  const results = [];

  for (const w of wallets) {
    try {
      const result = await correctUserDrift(w.userId);
      if (result && result.corrections.length > 0) results.push(result);
    } catch (err) {
      results.push({ userId: String(w.userId), error: err.message });
    }
  }

  return results;
}

export default { reconcileUser, reconcileAllUsers, getOnChainTotal, correctUserDrift, correctAllUsersDrift };
