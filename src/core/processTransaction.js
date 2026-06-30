import User from "../models/userModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import walletService from "../services/walletService.js";
import eventStreamService from "../services/eventStreamService.js";
import DepositReview from "../models/depositReviewModel.js";
import BankAccount from "../models/BankAccount.js";
import { archiveDeposit } from "../services/depositArchiveService.js";
import inspectorService from "../services/inspectorService.js";
import { InspectorStage } from "../inspector/inspectorConstants.js";

export default async function processTransaction(raw) {
  const { amount, senderPhone, senderName, senderLastFour, recipientLastFour, source, _flowId } = raw;
  const channelMap = { MARI_BANK: "BANK", MAYA: "MAYA", GCASH: "GCASH" };
  const channel = channelMap[source] || source;

  // ── Reuse existing flow or start new one ──────────────────────────────
  let flowId = _flowId;
  if (!flowId) {
    const flow = await inspectorService.startFlow({
      pipeline: "PHP_DEPOSIT",
      source,
      transactionType: "cashin",
      amount,
      currency: "PHP",
      sender: senderPhone || senderName || null,
      senderPhone: senderPhone || null,
      senderLastFour: senderLastFour || recipientLastFour || null,
      rawNotification: raw,
      parsedNotification: { amount, senderPhone, senderName, senderLastFour, recipientLastFour, source, channel },
    });
    flowId = flow.flowId;
  } else {
    // Update existing flow with parsed transaction data
    await inspectorService.startStage(flowId, "PROCESS_TRANSACTION", { amount, source, channel });
    await inspectorService.finishStage(flowId, "PROCESS_TRANSACTION", {
      result: { amount, channel, senderPhone, senderName },
      decision: { reason: "HANDED_OFF_FROM_WATCHER" },
    });
  }

  // ── Basic validation ───────────────────────────────────────────────────
  if (!amount || isNaN(amount) || amount <= 0) {
    await inspectorService.startStage(flowId, InspectorStage.PARSER, { amount });
    await inspectorService.failStage(flowId, InspectorStage.PARSER, "Invalid amount", {
      decision: { reason: "INVALID_AMOUNT" },
    });
    await flagForReview(raw, "INVALID_AMOUNT");
    return null;
  }

  // ── Step 1: USER LOOKUP ────────────────────────────────────────────────
  let user = null;
  await inspectorService.startStage(flowId, InspectorStage.USER_LOOKUP, { source, senderPhone, senderName, senderLastFour, recipientLastFour });

  if (source === "MARI_BANK") {
    if (!recipientLastFour) {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, "No recipientLastFour", {
        decision: { reason: "UNIDENTIFIABLE_RECIPIENT" },
      });
      await flagForReview(raw, "UNIDENTIFIABLE_RECIPIENT");
      return null;
    }
    const query = { accountNumber: { $regex: new RegExp(escapeRegex(recipientLastFour) + "$") }, status: "active" };
    const bankAccount = await BankAccount.findOne(query).lean();
    if (bankAccount) user = await User.findById(bankAccount.userId).lean();
    await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
      query,
      result: bankAccount ? { accountId: bankAccount._id, userId: bankAccount.userId } : null,
      decision: { matched: !!user, reason: user ? "MATCHED_BY_RECIPIENT_LAST_FOUR" : "NO_MATCHING_USER" },
    });

  } else if (source === "MAYA") {
    let matchMethod = null;
    if (senderPhone) {
      const query = { provider: "maya", accountNumber: senderPhone, status: "active" };
      const mayaAccount = await BankAccount.findOne(query).lean();
      if (mayaAccount) { user = await User.findById(mayaAccount.userId).lean(); matchMethod = "SENDER_PHONE"; }
    }
    if (!user && senderName && senderLastFour) {
      const query = {
        accountName: { $regex: new RegExp(escapeRegex(senderName), "i") },
        accountNumber: { $regex: new RegExp(escapeRegex(senderLastFour) + "$") },
        status: "active",
      };
      const bankAccount = await BankAccount.findOne(query).lean();
      if (bankAccount) { user = await User.findById(bankAccount.userId).lean(); matchMethod = "SENDER_NAME_LAST_FOUR"; }
    }
    await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
      result: user ? { userId: user._id, email: user.email } : null,
      decision: { matched: !!user, method: matchMethod, reason: user ? "MATCHED" : "NO_MATCHING_USER" },
    });
  } else {
    await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, `Unknown source: ${source}`);
    await flagForReview(raw, "UNKNOWN_SOURCE");
    return null;
  }

  if (!user) {
    await flagForReview(raw, "NO_MATCHING_USER");
    return null;
  }

  // ── Step 2: DEPOSIT MATCH ──────────────────────────────────────────────
  await inspectorService.startStage(flowId, InspectorStage.DEPOSIT_MATCH, { userId: user._id, channel, amount });
  const pendingDeposits = await DirectDeposit.find({
    userId: user._id, status: "PENDING", channel, amount, expiresAt: { $gt: new Date() },
  });

  if (pendingDeposits.length === 0) {
    await inspectorService.failStage(flowId, InspectorStage.DEPOSIT_MATCH, "No matching PENDING deposit", {
      query: { userId: user._id, channel, amount },
      result: { count: 0 },
      decision: { reason: "NO_MATCHING_DEPOSIT" },
    });
    await flagForReview(raw, "NO_MATCHING_DEPOSIT", user._id);
    return null;
  }

  if (pendingDeposits.length > 1) {
    await inspectorService.failStage(flowId, InspectorStage.DEPOSIT_MATCH, "Ambiguous deposits", {
      result: { count: pendingDeposits.length },
      decision: { reason: "AMBIGUOUS_DEPOSIT" },
    });
    await flagForReview(raw, "AMBIGUOUS_DEPOSIT", user._id);
    return null;
  }

  await inspectorService.finishStage(flowId, InspectorStage.DEPOSIT_MATCH, {
    result: { depositId: pendingDeposits[0]._id, referenceId: pendingDeposits[0].referenceId, amount: pendingDeposits[0].amount },
    decision: { reason: "SINGLE_MATCH" },
  });

  const deposit = pendingDeposits[0];

  // ── Step 3: Atomic claim ───────────────────────────────────────────────
  const claimed = await DirectDeposit.findOneAndUpdate(
    { _id: deposit._id, status: "PENDING" },
    { status: "CREDITED", creditedAt: new Date(), senderName: senderPhone || senderName || "unknown", senderLastFour: senderLastFour || null },
    { new: true }
  );

  if (!claimed) {
    await inspectorService.failStage(flowId, InspectorStage.LEDGER, "Race condition — already claimed");
    return { skipped: true, reason: "RACE_CONDITION_ALREADY_CLAIMED", depositId: deposit._id };
  }

  // ── Step 4: LEDGER ─────────────────────────────────────────────────────
  await inspectorService.startStage(flowId, InspectorStage.LEDGER, { userId: user._id, amount: claimed.amount });
  try {
    await walletService.credit(user._id.toString(), "PHP", claimed.amount, {
      referenceId: claimed.referenceId,
      description: `PHP deposit ₱${claimed.amount} from ${senderPhone || senderName || "unknown"} (ref: ${claimed.referenceId}, auto-matched)`,
      transactionType: "cashin",
    });
    await archiveDeposit(claimed, "CREDITED", { creditedAt: new Date(), senderName, senderPhone });
    await inspectorService.finishStage(flowId, InspectorStage.LEDGER, {
      result: { credited: claimed.amount, referenceId: claimed.referenceId, userId: user._id },
      decision: { reason: "CREDITED" },
    });
  } catch (creditErr) {
    await DirectDeposit.findOneAndUpdate({ _id: claimed._id }, { status: "PENDING" });
    await inspectorService.failStage(flowId, InspectorStage.LEDGER, creditErr.message);
    throw creditErr;
  }

  // ── Step 5: EVENT STREAM ───────────────────────────────────────────────
  await inspectorService.startStage(flowId, InspectorStage.EVENT_STREAM, {});
  try {
    await eventStreamService.emit("deposit.credited", {
      entityId: claimed.referenceId,
      userId: user._id.toString(),
      amount: claimed.amount,
      channel: claimed.channel,
      source,
      sender: senderPhone || senderName || "unknown",
      userEmail: user.email || "unknown",
      userName: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "unknown",
    });
    await inspectorService.finishStage(flowId, InspectorStage.EVENT_STREAM, {
      result: { emitted: "deposit.credited" },
    });
  } catch (eventErr) {
    await inspectorService.failStage(flowId, InspectorStage.EVENT_STREAM, eventErr.message);
  }

  await inspectorService.finishFlow(flowId);
  console.log(`[processTransaction] ✅ ₱${claimed.amount} credited to user ${user._id} (ref: ${claimed.referenceId})`);

  return { success: true, referenceId: claimed.referenceId, userId: user._id, amount: claimed.amount, channel: claimed.channel };
}

async function flagForReview(raw, reason, userId = null) {
  try {
    await DepositReview.create({
      userId, chain: raw.source || "PHP", asset: "PHP",
      amount: raw.amount || 0,
      txHash: raw.referenceId || ("REVIEW-" + Date.now()),
      status: "pending_review",
    });
    await eventStreamService.emit("deposit.flagged", {
      entityId: null,
      userId: userId ? userId.toString() : null,
      reason, raw,
    });
  } catch (err) {
    console.error("[processTransaction] Failed to flag for review:", err.message);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
