// src/services/accountRefreshService.js

import { syncWalletBalance } from "./blockchain/workers/walletBalanceSyncWorker.js";
import { correctUserDrift } from "./reconciliationService.js";
import { getUserBalance } from "./balanceService.js";

const refreshLocks = new Map();

/**
 * Manually synchronizes a single user's account.
 *
 * Pipeline:
 *
 * Refresh Account
 *      ↓
 * Sync Live On-chain Balances
 *      ↓
 * Reconcile Ledger ↔ Chain
 *      ↓
 * Correct Balance Drift
 *      ↓
 * Rebuild Wallet Balances
 */
export async function refreshAccount(userId) {
  const key = String(userId);

  if (refreshLocks.has(key)) {
    return refreshLocks.get(key);
  }

  const task = (async () => {
    const startedAt = new Date();

    const result = {
      success: true,
      startedAt,
      completedAt: null,
      stages: {
        sync: null,
        reconciliation: null,
        balances: null,
      },
    };

    try {
      // ---------------------------------------
      // Stage 1
      // Live blockchain synchronization
      // ---------------------------------------

      result.stages.sync =
        await syncWalletBalance(userId);

      // ---------------------------------------
      // Stage 2
      // Ledger ↔ On-chain reconciliation
      // ---------------------------------------

      result.stages.reconciliation =
        await correctUserDrift(userId);

      // ---------------------------------------
      // Stage 3
      // Rebuild wallet balances from Ledger
      // ---------------------------------------

      result.stages.balances =
        await getUserBalance(userId);

      result.completedAt = new Date();

      return result;
    } catch (err) {
      console.error(
        "[RefreshAccount]",
        err
      );

      return {
        success: false,
        error: err.message,
        startedAt,
        completedAt: new Date(),
        stages: result.stages,
      };
    } finally {
      refreshLocks.delete(key);
    }
  })();

  refreshLocks.set(key, task);

  return task;
}

export default {
  refreshAccount,
};
