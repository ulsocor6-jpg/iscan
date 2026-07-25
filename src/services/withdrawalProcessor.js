// src/services/withdrawalProcessor.js
//
// Shared logic for actually settling a crypto withdrawal on-chain:
// debit ledger -> send -> mark completed (with txHash), or on failure,
// credit the debit back and mark failed. Used by:
//   - withdrawalController.js — automatic, immediately at request time
//   - adminWithdrawalController.js — manual fallback / retry path

import walletService from "./walletService.js";
import { sendCryptoToAddress } from "./treasury/treasurySendService.js";
import eventStreamService from "./eventStreamService.js";
import { sendTelegramAlert } from "./telegramAlertService.js";
import inspector from "./blockchain/inspector/blockchainInspector.js";
import brainBus from "../brainbus/brainBus.js";
import { Channels } from "../brainbus/channels.js";

function autoApproveLimitFor(asset) {
  const raw = process.env[`AUTO_WITHDRAW_LIMIT_${asset}`];
  return raw ? parseFloat(raw) : null;
}

export function exceedsAutoApproveLimit(withdrawal) {
  const limit = autoApproveLimitFor(withdrawal.asset);
  return limit !== null && withdrawal.amount > limit;
}

export async function settleCryptoWithdrawal(withdrawal) {
  const flowId = `WD-${withdrawal._id}`;

  // ── BrainBus: wake event-driven watchers (recoveryWorker, blockchainEngine)
  // — plain channel name, separate from the Inspector's structured
  // INSPECTOR_FLOW_* channels below, which power the UI timeline but are
  // not what those watchers listen for.
  brainBus.emit("withdrawal.started", {
    withdrawalId: withdrawal._id.toString(),
    userId: withdrawal.userId,
    asset: withdrawal.asset,
    network: withdrawal.network,
    amount: withdrawal.amount
  }, { source: "WithdrawalProcessor", correlationId: flowId });

  // ── BrainBus: flow started ──────────────────────────────────────────
  brainBus.emit(Channels.INSPECTOR_FLOW_STARTED, {
    flowId,
    pipeline: "WITHDRAWAL",
    source: withdrawal.asset,
    amount: withdrawal.amount,
    currency: withdrawal.asset,
    status: "RUNNING",
    stages: []
  }, { source: "WithdrawalProcessor", correlationId: flowId });

  try {
    // ── BrainBus: stage DEBIT ─────────────────────────────────────────
    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
      flowId, pipeline: "WITHDRAWAL", stage: "DEBIT",
      data: { status: "RUNNING" }
    }, { source: "WithdrawalProcessor", correlationId: flowId });

    await walletService.debit(
      withdrawal.userId,
      withdrawal.asset,
      withdrawal.amount,
      {
        referenceId: flowId,
        description: "Withdrawal settled"
      }
    );

    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
      flowId, pipeline: "WITHDRAWAL", stage: "DEBIT",
      data: { status: "SUCCESS" }
    }, { source: "WithdrawalProcessor", correlationId: flowId });

  } catch (debitErr) {
    withdrawal.status = "failed";
    withdrawal.failReason = debitErr.message;
    await withdrawal.save();

    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
      flowId, pipeline: "WITHDRAWAL", stage: "DEBIT",
      data: { status: "FAILED", error: debitErr.message }
    }, { source: "WithdrawalProcessor", correlationId: flowId });
    brainBus.emit(Channels.INSPECTOR_FLOW_COMPLETED, {
      flowId, result: { status: "FAILED", error: debitErr.message }
    }, { source: "WithdrawalProcessor", correlationId: flowId });

    inspector.error("withdrawal", `Debit failed for ${flowId}: ${debitErr.message}`, {
      orderId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      step: "debit",
    });
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
      `Ref: <code>${flowId}</code>\n` +
      `Error: ${debitErr.message}`
    ).catch(alertErr => console.error("[withdrawalProcessor] Telegram alert failed:", alertErr.message));
    return { success: false, error: debitErr.message, withdrawal, stage: "debit" };
  }

  try {
    // ── BrainBus: stage SEND ──────────────────────────────────────────
    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
      flowId, pipeline: "WITHDRAWAL", stage: "SEND",
      data: { status: "RUNNING" }
    }, { source: "WithdrawalProcessor", correlationId: flowId });

    const sendAmount = withdrawal.netAmount > 0 ? withdrawal.netAmount : withdrawal.amount;
    const result = await sendCryptoToAddress({
      chain: withdrawal.network,
      currency: withdrawal.asset,
      amount: sendAmount,
      toAddress: withdrawal.destinationAddress,
      txRef: flowId,
    });

    withdrawal.status = "completed";
    withdrawal.txHash = result.txHash;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
      flowId, pipeline: "WITHDRAWAL", stage: "SEND",
      data: { status: "SUCCESS", txHash: result.txHash }
    }, { source: "WithdrawalProcessor", correlationId: flowId });
    brainBus.emit(Channels.INSPECTOR_FLOW_COMPLETED, {
      flowId, result: { status: "SUCCESS", txHash: result.txHash }
    }, { source: "WithdrawalProcessor", correlationId: flowId });

    inspector.success("withdrawal", `${flowId} settled`, {
      orderId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      txHash: result.txHash,
    });
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
    await walletService.credit(
      withdrawal.userId,
      withdrawal.asset,
      withdrawal.amount,
      {
        referenceId: `${flowId}-REVERSAL`,
        description: "Withdrawal send failed — reversed"
      }
    );

    withdrawal.status = "failed";
    withdrawal.failReason = sendErr.message;
    await withdrawal.save();

    brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
      flowId, pipeline: "WITHDRAWAL", stage: "SEND",
      data: { status: "FAILED", error: sendErr.message }
    }, { source: "WithdrawalProcessor", correlationId: flowId });
    brainBus.emit(Channels.INSPECTOR_FLOW_COMPLETED, {
      flowId, result: { status: "FAILED", error: sendErr.message }
    }, { source: "WithdrawalProcessor", correlationId: flowId });

    inspector.error("withdrawal", `Send failed for ${flowId}: ${sendErr.message}`, {
      orderId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      step: "send",
    });
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
      `Ref: <code>${flowId}</code>\n` +
      `Error: ${sendErr.message}\n` +
      `Ledger debit reversed — needs manual review.`
    ).catch(alertErr => console.error("[withdrawalProcessor] Telegram alert failed:", alertErr.message));
    return { success: false, error: sendErr.message, withdrawal, stage: "send" };
  }
}
