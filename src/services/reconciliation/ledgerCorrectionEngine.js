// src/services/reconciliation/ledgerCorrectionEngine.js
//
// Applies an APPROVED correction proposal as an actual double-entry pair:
//
//   chain_ahead_of_ledger (crediting the user - funds are real, uncredited):
//     Debit:  Reconciliation Account
//     Credit: User Wallet
//
//   ledger_ahead_of_chain (debiting the user - ledger claims more than chain has):
//     Debit:  User Wallet
//     Credit: Reconciliation Account
//
// The user-side leg goes through walletService.credit/debit (same as the
// original reconciliationService.correctUserDrift), so Wallet.balances /
// the rest of the app keeps working exactly as it does today. The
// Reconciliation Account leg is an extra Ledger row against a system
// account, written directly - it exists purely so the platform's books
// balance to zero across a correction instead of money appearing from or
// vanishing into nowhere.
//
// The Reconciliation Account is OPTIONAL: set RECONCILIATION_ACCOUNT_USER_ID
// to a real User _id (create one system user for this) to enable true
// double-entry. Without it, corrections still apply (single-entry, exactly
// like the original correctUserDrift), just without the offsetting leg -
// set the env var when you're ready to close that gap.

import mongoose from 'mongoose';
import Ledger from '../../models/ledgerModel.js';
import walletService from '../walletService.js';
import inspector from '../blockchain/inspector/blockchainInspector.js';
import { getUserBalance } from '../balanceService.js';
import transactionFinalizer from './transactionFinalizer.js';
import notificationLayer from './notificationLayer.js';

const RECONCILIATION_ACCOUNT_USER_ID = process.env.RECONCILIATION_ACCOUNT_USER_ID || null;

async function writeReconciliationAccountLeg({ currency, amount, direction, referenceId, correlatesWith }) {
  if (!RECONCILIATION_ACCOUNT_USER_ID) return null;

  // Opposite side of whatever happened to the user.
  const isUserCredit = direction === 'chain_ahead_of_ledger';

  const entry = await Ledger.create({
    userId: new mongoose.Types.ObjectId(RECONCILIATION_ACCOUNT_USER_ID),
    referenceId: `${referenceId}-recon-account`,
    transactionType: 'balance_correction',
    debit:  isUserCredit ? amount : 0,
    credit: isUserCredit ? 0 : amount,
    currency,
    description: `Reconciliation offset for user correction ${correlatesWith}`,
    status: 'completed',
    metadata: { offsetFor: correlatesWith, direction },
  });

  return entry.referenceId;
}

// proposal: a CorrectionQueue document (or plain object with the same shape).
export async function applyCorrection(proposal) {
  const { userId, currency, direction, drift, runId } = proposal;
  const amount = Math.abs(drift);
  const referenceId = transactionFinalizer.buildReferenceId(proposal._id ?? proposal.referenceId);

  if (await transactionFinalizer.alreadyApplied(referenceId)) {
    inspector.info('reconciliation', `Correction ${referenceId} already applied, skipping`, { userId: String(userId), currency });
    return { alreadyApplied: true, referenceId };
  }

  const appliedLedgerRefs = [referenceId];

  try {
    if (direction === 'chain_ahead_of_ledger') {
      await walletService.credit(userId, currency, amount, {
        referenceId,
        description: `Balance correction: ${currency} on-chain balance exceeded ledger`,
        transactionType: 'balance_correction',
      });
    } else if (direction === 'ledger_ahead_of_chain') {
      await walletService.debit(userId, currency, amount, {
        referenceId,
        description: `Balance correction: ${currency} ledger balance exceeded on-chain`,
        transactionType: 'balance_correction',
      });
    } else {
      throw new Error(`unknown correction direction: ${direction}`);
    }

    const offsetRef = await writeReconciliationAccountLeg({
      currency, amount, direction, referenceId, correlatesWith: String(userId),
    });
    if (offsetRef) appliedLedgerRefs.push(offsetRef);

    // Balance Snapshot Rebuilder - recompute Wallet.balances from the
    // Ledger now that the correction row exists.
    const rebuiltBalances = await getUserBalance(userId);

    await transactionFinalizer.recordAudit({
      userId, currency, event: 'APPLIED', referenceId, runId,
      detail: { direction, amount, rebuiltBalances },
    });

    inspector.info(
      'reconciliation',
      `Correction applied: ${currency} ${direction} by ${amount}`,
      { userId: String(userId), currency, direction, amount, referenceId },
    );

    await notificationLayer.notifyUser(userId, {
      type: 'balance_adjusted', currency, amount, direction,
    });
    await notificationLayer.notifyOperator({
      type: 'correction_completed', userId: String(userId), currency, amount, direction, referenceId,
    });
    await notificationLayer.notifyCompliance({
      type: 'audit_event', userId: String(userId), currency, amount, direction, referenceId, runId,
    });

    return { alreadyApplied: false, referenceId, appliedLedgerRefs, rebuiltBalances };
  } catch (err) {
    await transactionFinalizer.recordAudit({
      userId, currency, event: 'APPLY_FAILED', referenceId, runId,
      detail: { direction, amount, error: err.message },
    });
    inspector.error(
      'reconciliation',
      `Correction FAILED: ${currency} ${direction} for user ${userId}: ${err.message}`,
      { userId: String(userId), currency, direction, amount, referenceId },
    );
    throw err;
  }
}

export default { applyCorrection };
