import mongoose from "mongoose";
import DirectDeposit from "../models/DirectDepositModel.js";
import walletService from "../services/walletService.js";
import eventStreamService from "../services/eventStreamService.js";

/**
 * processTransaction()
 * Matches an incoming raw deposit notification (e.g. parsed Maribank email)
 * against a pre-existing DirectDeposit record, and credits the correct user
 * only if everything lines up. Never guesses or falls back to a default user.
 */
export default async function processTransaction(raw) {
  const { amount, referenceId, sender, source } = raw;

  if (!referenceId) {
    console.warn(`[processTransaction] No referenceId found in ${source || "unknown"} notification — cannot match. Raw:`, raw);
    await flagForReview(raw, "MISSING_REFERENCE");
    return null;
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    console.warn(`[processTransaction] Invalid amount for ref ${referenceId}:`, amount);
    await flagForReview(raw, "INVALID_AMOUNT");
    return null;
  }

  // Look up the pending deposit request this notification should match
  const deposit = await DirectDeposit.findOne({ referenceId });

  if (!deposit) {
    console.warn(`[processTransaction] No DirectDeposit found for ref ${referenceId}. Flagging for manual review.`);
    await flagForReview(raw, "NO_MATCHING_DEPOSIT");
    return null;
  }

  // Idempotency — already handled, do nothing
  if (deposit.status === "CREDITED") {
    console.log(`[processTransaction] Ref ${referenceId} already CREDITED — skipping duplicate.`);
    return { skipped: true, reason: "ALREADY_CREDITED", referenceId };
  }

  if (deposit.status === "EXPIRED") {
    console.warn(`[processTransaction] Ref ${referenceId} is EXPIRED but money arrived. Flagging for manual review.`);
    await flagForReview(raw, "DEPOSIT_EXPIRED", deposit.userId);
    return null;
  }

  // Amount must match what the user said they'd send — refuse to silently auto-correct
  if (Number(amount) !== Number(deposit.amount)) {
    console.warn(`[processTransaction] Amount mismatch for ref ${referenceId}: expected ₱${deposit.amount}, got ₱${amount}. Flagging for manual review.`);
    await flagForReview(raw, "AMOUNT_MISMATCH", deposit.userId);
    return null;
  }

  // Atomically claim this deposit so concurrent/duplicate emails can't double-process it
  const claimed = await DirectDeposit.findOneAndUpdate(
    { referenceId, status: "PENDING" },
    { status: "CREDITED", creditedAt: new Date(), senderName: sender || "unknown" },
    { new: true }
  );

  if (!claimed) {
    // Someone else (e.g. a concurrent webhook, or admin manual confirm) already claimed it
    console.log(`[processTransaction] Ref ${referenceId} was claimed by another process — skipping.`);
    return { skipped: true, reason: "RACE_CONDITION_ALREADY_CLAIMED", referenceId };
  }

  try {
    await walletService.credit(claimed.userId.toString(), "PHP", claimed.amount, {
      referenceId,
      description: `Direct deposit via ${claimed.channel} from ${sender || "unknown"} (auto-matched, source: ${source})`,
      transactionType: "cashin",
    });
  } catch (creditErr) {
    // Roll back the claim so this can be retried/manually fixed
    await DirectDeposit.findOneAndUpdate({ referenceId }, { status: "PENDING" });
    console.error(`[processTransaction] Ledger credit failed for ref ${referenceId}, rolled back:`, creditErr.message);
    throw creditErr;
  }

  console.log(`[processTransaction] ✅ Credited ₱${claimed.amount} to user ${claimed.userId} (ref: ${referenceId}, source: ${source})`);

  // Emit event for live dashboard / audit trail — safe to fail silently, not core to the credit itself
  try {
    await eventStreamService.emit("deposit.credited", {
      entityId: referenceId,
      userId: claimed.userId.toString(),
      amount: claimed.amount,
      channel: claimed.channel,
      source,
      sender: sender || "unknown",
    });
  } catch (eventErr) {
    console.error("[processTransaction] Failed to emit deposit event (non-fatal):", eventErr.message);
  }

  return {
    success: true,
    referenceId,
    userId: claimed.userId,
    amount: claimed.amount,
    channel: claimed.channel,
  };
}

/**
 * flagForReview()
 * Records an unmatched/suspicious incoming deposit notification for manual admin handling.
 * Never throws — a flagging failure should never crash the listener.
 */
async function flagForReview(raw, reason, userId = null) {
  try {
    await eventStreamService.emit("deposit.flagged", {
      entityId: raw.referenceId || null,
      userId: userId ? userId.toString() : null,
      reason,
      raw,
    });
  } catch (err) {
    console.error("[processTransaction] Failed to flag for review (non-fatal):", err.message);
  }
}
