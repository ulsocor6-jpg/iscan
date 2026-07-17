// src/services/withdrawalProcessor.js
//
// Shared logic for actually settling a crypto withdrawal on-chain:
// debit ledger -> send -> mark completed (with txHash), or on failure,
// credit the debit back and mark failed. Used by:
//   - withdrawalController.js — automatic, immediately at request time,
//     once the balance check has already confirmed sufficient funds
//   - adminWithdrawalController.js — manual fallback / retry path for
//     anything that didn't auto-process (e.g. non-crypto types, or a
//     previously failed crypto withdrawal an admin wants to re-attempt)

import walletService from "./walletService.js";
import { sendCryptoToAddress } from "./treasury/treasurySendService.js";
import eventStreamService from "./eventStreamService.js";
import { sendTelegramAlert } from "./telegramAlertService.js";

// Optional safety valve: per-request cap above which a crypto withdrawal
// is left as "pending_review" for manual approval instead of settling
// automatically. Unset by default — no limit, matches "always auto if
// balance is sufficient." Set e.g. AUTO_WITHDRAW_LIMIT_USDC=500 to enable.
function autoApproveLimitFor(asset) {
  const raw = process.env[`AUTO_WITHDRAW_LIMIT_${asset}`];
  return raw ? parseFloat(raw) : null;
}

export function exceedsAutoApproveLimit(withdrawal) {
  const limit = autoApproveLimitFor(withdrawal.asset);
  return limit !== null && withdrawal.amount > limit;
}

/**
 * Debits the ledger, sends the real on-chain transaction, and updates
 * the withdrawal's status accordingly. Caller is responsible for having
 * already confirmed balance is sufficient and (if relevant) that this
 * withdrawal isn't over any configured auto-approve limit.
 */
export async function settleCryptoWithdrawal(withdrawal) {
  try {
    await walletService.debit(
      withdrawal.userId,
      withdrawal.asset,
      withdrawal.amount,
      {
        referenceId: `WD-${withdrawal._id}`,
        description: "Withdrawal settled"
      }
    );
  } catch (debitErr) {
    // Nothing was ever moved here — no ledger reversal needed, unlike the
    // send-failure path below. Most common cause: a race where two
    // requests both passed the controller's balance pre-check, but only
    // one debit can win the atomic $gte guard in walletService.debit.
    withdrawal.status = "failed";
    withdrawal.failReason = debitErr.message;
    await withdrawal.save();

    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: debitErr.message,
      stage: "debit",
    });

    sendTelegramAlert(
      `\u26a0\ufe0f <b>Crypto withdrawal FAILED (debit)</b>\n` +
      `Asset: ${withdrawal.asset} (${withdrawal.network})\n` +
      `Amount: ${withdrawal.amount}\n` +
      `User: <code>${withdrawal.userId}</code>\n` +
      `Ref: <code>WD-${withdrawal._id}</code>\n` +
      `Error: ${debitErr.message}\n` +
      `No funds were moved \u2014 balance check failed at settle time.`
    ).catch(alertErr => {
      console.error("[withdrawalProcessor] Telegram alert failed:", alertErr.message);
    });

    return { success: false, error: debitErr.message, withdrawal, stage: "debit" };
  }

  try {
    // Send netAmount (amount minus fees) on-chain, not the full debited
    // amount — the fee difference simply stays in the treasury wallet
    // rather than going out to the user. Fall back to the full amount for
    // any withdrawal created before fee tracking existed (netAmount will
    // be the schema default of 0 in that case, not a real "send nothing").
    const sendAmount = withdrawal.netAmount > 0 ? withdrawal.netAmount : withdrawal.amount;

    const result = await sendCryptoToAddress({
      chain: withdrawal.network,
      currency: withdrawal.asset,
      amount: sendAmount,
      toAddress: withdrawal.destinationAddress,
      txRef: `WD-${withdrawal._id}`,
    });

    withdrawal.status = "completed";
    withdrawal.txHash = result.txHash;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    await eventStreamService.emit("withdrawal.completed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      sentAmount: sendAmount,
      fee: withdrawal.fee || 0,
      txHash: result.txHash,
    });

    return { success: true, withdrawal };

  } catch (sendErr) {
    // Ledger debit already happened above — reverse it so the user isn't
    // out the amount with nothing sent, and mark this failed for manual
    // review rather than leaving it stuck with no transaction.
    await walletService.credit(
      withdrawal.userId,
      withdrawal.asset,
      withdrawal.amount,
      {
        referenceId: `WD-${withdrawal._id}-REVERSAL`,
        description: "Withdrawal send failed — reversed"
      }
    );

    withdrawal.status = "failed";
    withdrawal.failReason = sendErr.message;
    await withdrawal.save();

    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: sendErr.message,
    });

    sendTelegramAlert(
      `🚨 <b>Crypto withdrawal FAILED</b>\n` +
      `Asset: ${withdrawal.asset} (${withdrawal.network})\n` +
      `Amount: ${withdrawal.amount}\n` +
      `User: <code>${withdrawal.userId}</code>\n` +
      `Ref: <code>WD-${withdrawal._id}</code>\n` +
      `Error: ${sendErr.message}\n` +
      `Ledger debit reversed — needs manual review.`
    ).catch(alertErr => {
      console.error("[withdrawalProcessor] Telegram alert failed:", alertErr.message);
    });
    return { success: false, error: sendErr.message, withdrawal, stage: "send" };
  }
}
