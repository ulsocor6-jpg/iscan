import PendingOperation from '../../models/blockchain/pendingOperationModel.js';
import verificationEngine from '../verification/VerificationEngine.js';
import processTransaction from '../../core/processTransaction.js';
import inspectorService from '../inspectorService.js';
import deduplicationService from '../ingestion/deduplicationService.js';
import brainBus from '../../brainbus/brainBus.js';
import Channels from '../../brainbus/channels.js';

// Default amount-match tolerance used when a PendingOperation doesn't
// specify its own `tolerance` field. Expressed as a fraction (0.01 = 1%).
const DEFAULT_AMOUNT_TOLERANCE = 0.01;

/**
 * Dedicated watcher for PHP deposits (Maya, MariBank, etc.)
 * Responsible for:
 * - Correlating incoming Android notifications to pending operations
 * - Verifying signatures using per-operation secrets (via VerificationEngine)
 * - Triggering the transaction engine
 * - Emitting operator incidents / system health events on failure
 */
class PhpDepositWatcher {
  /**
   * Process an incoming Android notification.
   *
   * @param {Object} payload
   * @param {string} payload.source - 'MAYA' or 'MARIBANK'.
   * @param {string} payload.userId - User ID.
   * @param {string} [payload.operationId] - Optional, if the Android app already knows it.
   * @param {number} payload.amount - Parsed amount from notification.
   * @param {string} payload.reference - Reference from the notification.
   * @param {string} payload.title - Notification title.
   * @param {string} payload.text - Notification text.
   * @param {number} payload.timestamp - Unix timestamp.
   * @param {string} payload.signature - HMAC signature.
   * @param {Object} payload.parsedTransaction - The parsed transaction object.
   * @param {string} [payload.flowId] - Inspector flow ID (optional).
   * @param {string} [payload.eventId] - Deduplication event ID.
   *
   * @returns {Promise<Object>} { success, status, message, transaction? }
   */
  async processNotification(payload) {
    brainBus.emit("deposit.php.received", { operationId: payload.operationId, userId: payload.userId });
    const {
      source,
      userId,
      operationId,
      amount,
      reference,
      title,
      text,
      timestamp,
      signature,
      parsedTransaction,
      flowId,
      eventId,
    } = payload;

    let pendingOp = null;

    // ── Step 1: Correlate to pending operation ──────────────────────
    if (operationId) {
      // If operationId provided, fetch it directly.
      pendingOp = await PendingOperation.findOne({ operationId, status: 'PENDING' });
      if (!pendingOp) {
        return { success: false, status: 'operation_not_found', message: `No pending operation found for ID: ${operationId}` };
      }
    } else {
      // Otherwise, try to match by userId, amount (within tolerance), and source/provider.
      pendingOp = await this.matchPendingOperation(userId, amount, source);
      if (!pendingOp) {
        return { success: false, status: 'no_matching_operation', message: 'No matching pending operation found' };
      }
    }

    // Everything past this point assumes a resolved pendingOp. Both branches
    // above return early on a miss, so this should be unreachable — but we
    // guard explicitly so a future change to the branches above fails loudly
    // instead of throwing deep inside a save() call.
    if (!pendingOp) {
      throw new Error('PhpDepositWatcher.processNotification: reached verification with no pendingOp');
    }

    // ── Step 2: Run verification engine with operation context ─────
    const verification = await verificationEngine.verify({
      source,
      userId,
      amount,
      reference,
      signature,
      timestamp,
      asset: 'PHP',
      operationId: pendingOp.operationId,
      title,
      text,
    }, { pendingOperation: pendingOp });

    if (!verification.passed) {
      await this.handleVerificationFailure(verification, flowId, eventId, source, userId);
      return { success: false, status: 'verification_failed', message: verification.reason, details: verification.results };
    }

    // ── Step 3: Proceed to transaction processing ──────────────────
    try {
      const txPayload = {
        ...parsedTransaction,
        userId,
        _flowId: flowId,
        operationId: pendingOp.operationId,
      };
      await processTransaction(txPayload);

      pendingOp.status = 'COMPLETED';
      await pendingOp.save();

      if (eventId && source) await deduplicationService.markProcessed(source, eventId);
      if (flowId) await inspectorService.finishFlow(flowId);

      return { success: true, status: 'ok', message: 'Deposit processed successfully', transaction: txPayload };
    } catch (err) {
      pendingOp.status = 'FAILED';
      pendingOp.failureReason = err.message;
      await pendingOp.save();

      if (eventId && source) await deduplicationService.markFailed(source, eventId, err.message);
      if (flowId) {
        await inspectorService.failStage(flowId, 'PROCESS_TRANSACTION', err.message).catch((inspectorErr) => {
          console.error('[PhpDepositWatcher] failed to record failStage on inspector:', inspectorErr);
        });
      }

      return { success: false, status: 'processing_error', message: err.message };
    }
  }

  /**
   * Match a pending operation by userId, amount (within tolerance), and source.
   */
  async matchPendingOperation(userId, amount, source) {
    const provider = source.toLowerCase(); // e.g. 'maya', 'maribank'

    // Find all pending operations for this user with provider = source or null (generic).
    const ops = await PendingOperation.find({
      userId,
      status: 'PENDING',
      $or: [{ provider }, { provider: null }],
      operationType: 'DEPOSIT',
      asset: 'PHP',
      expiration: { $gt: new Date() },
    });

    // Sort by closest amount match (within tolerance).
    let bestMatch = null;
    let bestDiff = Infinity;

    for (const op of ops) {
      const diff = Math.abs(op.expectedAmount - amount);
      const pctDiff = op.expectedAmount > 0 ? diff / op.expectedAmount : Infinity;
      if (pctDiff <= (op.tolerance || DEFAULT_AMOUNT_TOLERANCE) && pctDiff < bestDiff) {
        bestDiff = pctDiff;
        bestMatch = op;
      }
    }

    return bestMatch;
  }

  /**
   * Handle a verification failure — emit events to the operator / intelligent layer.
   */
  async handleVerificationFailure(verification, flowId, eventId, source, userId) {
    brainBus.emit("deposit.php.verification_failed", { flowId, reason: verification.reason, userId });
    if (flowId) {
      await inspectorService.failStage(flowId, 'VERIFICATION', verification.reason).catch((inspectorErr) => {
        console.error('[PhpDepositWatcher] failed to record failStage on inspector:', inspectorErr);
      });
    }
    if (eventId && source) {
      await deduplicationService.markFailed(source, eventId, verification.reason).catch((dedupErr) => {
        console.error('[PhpDepositWatcher] failed to mark dedup event as failed:', dedupErr);
      });
    }

    brainBus.emit(Channels.OPERATOR_INCIDENT, {
      type: 'VERIFICATION_FAILED',
      severity: 'high',
      flowId,
      userId,
      reason: verification.reason,
      details: verification.results,
      source,
      timestamp: new Date().toISOString(),
    }, { source: 'PhpDepositWatcher', correlationId: flowId });

    brainBus.emit(Channels.SYSTEM_HEALTH, {
      status: 'warning',
      component: 'PhpDepositWatcher',
      message: `Verification failed for ${source} deposit: ${verification.reason}`,
      flowId,
      userId,
    }, { source: 'PhpDepositWatcher', correlationId: flowId });
  }
}

export default new PhpDepositWatcher();
