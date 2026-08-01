// src/intelligence/laptop/mexcWatcher.js
// Event-driven, NOT a continuous poller. Only calls the MEXC API while at
// least one PendingOperation (provider: 'mexc', status: 'PENDING') exists —
// i.e. only while we're actually expecting an incoming amount. Idle the rest
// of the time: zero MEXC API calls, zero wasted compute.
//
// Flow:
//   1. adminTreasuryController.createSweepIntent() creates a PendingOperation
//      AND captures a baseline MEXC balance at that moment (metadata.baselineBalance).
//   2. It calls watchPendingOperation(operationId), which polls MEXC on a
//      short interval, computing delta = currentBalance - baselineBalance.
//   3. Once delta matches expectedAmount within tolerance, the operation is
//      marked COMPLETED **before** the TreasuryAccount balance is updated —
//      updatePhysicalBalance() triggers recalculatePool(), which computes
//      the independent expectedBalance via pendingOperationProjection
//      (status:'PENDING' query). Updating the balance BEFORE flipping this
//      op to COMPLETED would leave it double-counted — once as already
//      arrived (new balance) and once as still-pending (projection) — which
//      produces a spurious variance and a false CRITICAL incident at the
//      exact moment everything actually went right. Order matters here.
//   4. If expiration passes with no match, the operation is marked EXPIRED
//      and polling stops.
//   5. resumeActiveWatches() runs once at boot — a single cheap DB query,
//      no MEXC call — to re-attach watches for any operation that was still
//      PENDING when the server last restarted.

import PendingOperation from "../../models/blockchain/pendingOperationModel.js";
import TreasuryAccount from "../../models/treasuryAccountModel.js";
import treasuryCoordinator from "../../services/treasury/treasuryCoordinator.js";
import { getAssetBalance } from "../../integrations/mexcClient.js";

const POLL_INTERVAL_MS = 15 * 1000; // only while a watch is active
const _activeWatches = new Map(); // operationId -> interval handle, prevents double-starting

export async function watchPendingOperation(operationId) {
  if (_activeWatches.has(operationId)) return; // already being watched

  const check = async () => {
    const op = await PendingOperation.findOne({ operationId });

    if (!op || op.status !== "PENDING") {
      stop();
      return;
    }

    if (new Date() > op.expiration) {
      await PendingOperation.updateOne({ operationId }, { status: "EXPIRED" });
      console.log(`[MexcWatcher] ${operationId} expired with no match — stopped watching`);
      stop();
      return;
    }

    try {
      const asset = op.asset;
      const baseline = Number(op.metadata?.baselineBalance || 0);
      const { free: currentBalance } = await getAssetBalance(asset);
      const delta = currentBalance - baseline;

      const tolerance = op.tolerance || 0.02;
      const expected = op.expectedAmount;
      const pctDiff = expected > 0 ? Math.abs(expected - delta) / expected : Infinity;

      console.log(`[MexcWatcher] ${operationId} — baseline=${baseline} current=${currentBalance} delta=${delta} expected=${expected}`);

      if (delta > 0 && pctDiff <= tolerance) {
        // Mark COMPLETED *before* updating the balance — see file header
        // note. recalculatePool() (triggered by updatePhysicalBalance below)
        // computes expectedBalance via pendingOperationProjection, which
        // queries for status:'PENDING'. If we updated the balance first,
        // this operation would still count as pending at the exact moment
        // its own credit lands, producing a spurious variance of roughly
        // -expectedAmount and a false CRITICAL incident.
        await PendingOperation.updateOne(
          { operationId },
          { status: "COMPLETED", metadata: { ...op.metadata, observedDelta: delta, matchedAt: new Date() } }
        );

        const account = await TreasuryAccount.findOne({ provider: "mexc", currency: asset, isActive: true });
        if (account) {
          await treasuryCoordinator.updatePhysicalBalance(account._id, currentBalance, "mexc-watcher");
        } else {
          console.warn(`[MexcWatcher] No active TreasuryAccount for provider=mexc currency=${asset} — balance not recorded`);
        }

        console.log(`[MexcWatcher] ${operationId} MATCHED — delta ${delta} ${asset} within tolerance, marked COMPLETED`);
        stop();
      }
    } catch (err) {
      console.error(`[MexcWatcher] ${operationId} poll failed:`, err.message);
      // Don't stop on a transient API error — keep trying until expiration.
    }
  };

  const handle = setInterval(check, POLL_INTERVAL_MS);
  _activeWatches.set(operationId, handle);
  console.log(`[MexcWatcher] started watching ${operationId} (every 15s until match or expiration)`);

  function stop() {
    clearInterval(handle);
    _activeWatches.delete(operationId);
  }

  // Run once immediately rather than waiting for the first interval tick.
  check();
}

// Called once at boot. Single DB query, no MEXC API call — re-attaches
// watches for anything that was still PENDING when the server last stopped.
export async function resumeActiveWatches() {
  const pending = await PendingOperation.find({
    provider: "mexc",
    status: "PENDING",
    expiration: { $gt: new Date() },
  }).lean();

  if (pending.length === 0) {
    console.log("[MexcWatcher] No active sweep intents to resume — idle, no MEXC API calls scheduled");
    return;
  }

  console.log(`[MexcWatcher] Resuming ${pending.length} active sweep watch(es) from before restart`);
  for (const op of pending) {
    watchPendingOperation(op.operationId);
  }
}

export default { watchPendingOperation, resumeActiveWatches };
