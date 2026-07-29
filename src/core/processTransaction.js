import User from "../models/userModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import walletService from "../services/walletService.js";
import brainBus from "../brainbus/brainBus.js";
import Channels from "../brainbus/channels.js";
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
    await inspectorService.startStage(flowId, InspectorStage.PROCESS_TRANSACTION, { amount, source, channel });
    await inspectorService.finishStage(flowId, InspectorStage.PROCESS_TRANSACTION, {
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

    if (user) {
      await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
        query,
        result: {
          accountId: bankAccount._id,
          userId: bankAccount.userId,
          matchedUserName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || null,
        },
        decision: { matched: true, reason: "MATCHED_BY_RECIPIENT_LAST_FOUR" },
      });
    } else {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, "No BankAccount matches this recipient", {
        query,
        decision: { matched: false, reason: "NO_MATCHING_USER" },
      });
    }

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
      brainBus.emit("deposit.matched", { flowId, userId: user._id, source });
    }

    let ambiguousAnonymous = false;
    if (!user && !senderPhone && !senderName) {
      const candidates = await DirectDeposit.find({
        status: "PENDING", channel: "MAYA", amount, expiresAt: { $gt: new Date() },
      }).lean();

      if (candidates.length === 1) {
        user = await User.findById(candidates[0].userId).lean();
        matchMethod = "ANONYMOUS_AMOUNT_MATCH";
      } else if (candidates.length > 1) {
        ambiguousAnonymous = true;
        matchMethod = "AMBIGUOUS_ANONYMOUS_MATCH";
      }
    }

    if (user) {
      await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
        result: {
          userId: user._id,
          email: user.email,
          matchedUserName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || null,
        },
        decision: { matched: true, method: matchMethod, reason: "MATCHED" },
      });
    } else if (ambiguousAnonymous) {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP,
        "Multiple open MAYA deposits match this amount — cannot safely auto-credit an anonymous transfer", {
          decision: { matched: false, method: matchMethod, reason: "AMBIGUOUS_ANONYMOUS_MATCH" },
      });
      await flagForReview(raw, "AMBIGUOUS_ANONYMOUS_MATCH");
      return null;
    } else {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, "No BankAccount or open deposit matches this sender", {
        decision: { matched: false, method: matchMethod, reason: "NO_MATCHING_USER" },
      });
    }

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

  // ── Reconnect the original request-flow, if this one is an orphan ──────
  if (deposit.referenceId) {
    try {
      const originalFlow = await inspectorService.findRunningByReference(deposit.referenceId);
      if (originalFlow && originalFlow.flowId !== flowId) {
        await inspectorService.startStage(originalFlow.flowId, "RECONCILED", { via: source, linkedFlowId: flowId });
        await inspectorService.finishStage(originalFlow.flowId, "RECONCILED", {
          result: { creditedViaFlowId: flowId, source },
          decision: { reason: "COMPLETED_BY_SEPARATE_INGESTION_FLOW" },
        });
        await inspectorService.finishFlow(originalFlow.flowId);
      }
    } catch (reconcileErr) {
      console.error("[processTransaction] Failed to reconcile original flow:", reconcileErr.message);
    }
  }

  // ── Step 3: VERIFIER ────────────────────────────────────────────────────
  await inspectorService.startStage(flowId, InspectorStage.VERIFIER, { depositId: deposit._id, expectedAmount: amount });
  const stillValid = deposit.status === "PENDING" && deposit.expiresAt > new Date() && deposit.amount === amount;
  if (!stillValid) {
    await inspectorService.failStage(flowId, InspectorStage.VERIFIER, "Deposit no longer eligible at verify time", {
      result: { status: deposit.status, expiresAt: deposit.expiresAt, amountMatches: deposit.amount === amount },
      decision: { reason: "STALE_DEPOSIT" },
    });
    await flagForReview(raw, "STALE_DEPOSIT_AT_VERIFY", user._id);
    return null;
  }
  await inspectorService.finishStage(flowId, InspectorStage.VERIFIER, {
    result: { depositId: deposit._id, verifiedAmount: deposit.amount, verifiedStatus: deposit.status },
    decision: { reason: "VERIFIED_ELIGIBLE" },
  });

  // ── Step 4: Atomic claim ───────────────────────────────────────────────
  const claimed = await DirectDeposit.findOneAndUpdate(
    { _id: deposit._id, status: "PENDING" },
    { status: "CREDITED", creditedAt: new Date(), senderName: senderPhone || senderName || "unknown", senderLastFour: senderLastFour || null },
    { new: true }
  );

  if (!claimed) {
    await inspectorService.failStage(flowId, InspectorStage.LEDGER, "Race condition — already claimed");
    return { skipped: true, reason: "RACE_CONDITION_ALREADY_CLAIMED", depositId: deposit._id };
  }

  // ── Step 5: LEDGER ─────────────────────────────────────────────────────
  await inspectorService.startStage(flowId, InspectorStage.LEDGER, { userId: user._id, amount: claimed.amount });
  let wallet;
  try {
    wallet = await walletService.credit(user._id.toString(), "PHP", claimed.amount, {
      referenceId: claimed.referenceId,
      description: `PHP deposit ₱${claimed.amount} from ${senderPhone || senderName || "unknown"} (ref: ${claimed.referenceId}, auto-matched)`,
      transactionType: "cashin",
    });
    await archiveDeposit(claimed, "CREDITED", { creditedAt: new Date(), senderName, senderPhone });

    // ── Treasury sync: add incoming amount to the matching provider account ──
    try {
      const treasuryCoordinator = (await import('../services/treasury/treasuryCoordinator.js')).default;
      const providerMap = { MAYA: 'maya', MARI_BANK: 'maribank', GCASH: 'gcash' };
      const provider = providerMap[source] || 'maya';
      const accounts = await treasuryCoordinator.getLiveState('PHP');
      const target = accounts.find(a => a.provider === provider && a.isActive !== false);
      if (target) {
        await treasuryCoordinator.updatePhysicalBalance(
          target.id,
          target.physicalBalance + claimed.amount,
          'deposit'
        );
      }
    } catch (treasuryErr) {
      console.error('[processTransaction] Treasury sync failed:', treasuryErr.message);
    }

    await inspectorService.finishStage(flowId, InspectorStage.LEDGER, {
      result: { credited: claimed.amount, referenceId: claimed.referenceId, userId: user._id },
      decision: { reason: "CREDITED" },
    });

    // Feed ConsensusService's android-side proof. NOTE: this file still
    // credits directly above rather than waiting on consensus — this
    // emission is currently for tracking/cross-checking only. If the
    // intent is to gate crediting on dual-proof consensus, that requires
    // a separate, deliberate change to the flow above (flagging for
    // review, not silently changing money-movement behavior).
    brainBus.emit(Channels.DEPOSIT_VERIFIED, {
      depositId: claimed._id,
      userId: user._id,
      amount: claimed.amount,
      reference: claimed.referenceId,
      pool: channel,
    });
  } catch (creditErr) {
    await DirectDeposit.findOneAndUpdate({ _id: claimed._id }, { status: "PENDING" });
    await inspectorService.failStage(flowId, InspectorStage.LEDGER, creditErr.message);
    throw creditErr;
  }

  // ── Step 6: WALLET ──────────────────────────────────────────────────────
  await inspectorService.startStage(flowId, InspectorStage.WALLET, { userId: user._id });
  try {
    const newBalance = await walletService.getBalance(user._id.toString(), "PHP");
    await inspectorService.finishStage(flowId, InspectorStage.WALLET, {
      result: { walletId: wallet?._id, iscanAddress: wallet?.iscanAddress, newPhpBalance: newBalance },
      decision: { reason: "WALLET_BALANCE_CONFIRMED" },
    });
  } catch (walletErr) {
    await inspectorService.failStage(flowId, InspectorStage.WALLET, walletErr.message, {
      decision: { reason: "BALANCE_CONFIRM_FAILED_NON_FATAL" },
    });
  }

  // ── Step 7: EVENT STREAM ───────────────────────────────────────────────
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
  brainBus.emit("deposit.flagged", { raw, reason, userId });
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
