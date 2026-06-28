import User from "../models/userModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import walletService from "../services/walletService.js";
import eventStreamService from "../services/eventStreamService.js";
import DepositReview from "../models/depositReviewModel.js";
import BankAccount from "../models/BankAccount.js";
import { archiveDeposit } from "../services/depositArchiveService.js";

export default async function processTransaction(raw) {
  const { amount, senderPhone, senderName, senderLastFour, recipientLastFour, source } = raw;

  const channelMap = {
    MARI_BANK: "BANK",
    MAYA: "MAYA",
    GCASH: "GCASH",
  };

  const channel = channelMap[source] || source;

  // ── Basic validation ───────────────────────────────────────────────────
  if (!amount || isNaN(amount) || amount <= 0) {
    console.warn(`[processTransaction] Invalid amount from ${source}:`, amount);
    await flagForReview(raw, "INVALID_AMOUNT");
    return null;
  }

  // ── Step 1: Find the ISCAN user ────────────────────────────────────────
  let user = null;

  if (source === "MARI_BANK") {
    // MariBank email: "Transfer to: RAUL ROCO - 7726"
    // Match by recipient last four digits → their linked bank account
    if (!recipientLastFour) {
      console.warn(`[processTransaction] No recipientLastFour from MariBank email`);
      await flagForReview(raw, "UNIDENTIFIABLE_RECIPIENT");
      return null;
    }

    const bankAccount = await BankAccount.findOne({
      accountNumber: { $regex: new RegExp(escapeRegex(recipientLastFour) + "$") },
      status: "active",
    }).lean();

    if (bankAccount) {
      user = await User.findById(bankAccount.userId).lean();
    }

    if (!user) {
      console.warn(`[processTransaction] No active BankAccount ending in ${recipientLastFour}`);
      await flagForReview(raw, "NO_MATCHING_USER");
      return null;
    }

  } else if (source === "MAYA") {
    // Maya notification: identify by senderPhone (Maya-to-Maya) or senderName+lastFour (InstaPay)

    if (senderPhone) {
      // Maya-to-Maya: sender's phone = user's linked Maya number
      const mayaAccount = await BankAccount.findOne({
        provider: "maya",
        accountNumber: senderPhone,
        status: "active",
      }).lean();

      if (mayaAccount) {
        user = await User.findById(mayaAccount.userId).lean();
      }
    }

    if (!user && senderName && senderLastFour) {
      // InstaPay via Maya: match sender name + last four
      const bankAccount = await BankAccount.findOne({
        accountName: { $regex: new RegExp(escapeRegex(senderName), "i") },
        accountNumber: { $regex: new RegExp(escapeRegex(senderLastFour) + "$") },
        status: "active",
      }).lean();

      if (bankAccount) {
        user = await User.findById(bankAccount.userId).lean();
      }
    }

    if (!user) {
      console.warn(`[processTransaction] No ISCAN user found for Maya sender:`, { senderPhone, senderName, senderLastFour });
      await flagForReview(raw, "NO_MATCHING_USER");
      return null;
    }

  } else {
    console.warn(`[processTransaction] Unknown source: ${source}`);
    await flagForReview(raw, "UNKNOWN_SOURCE");
    return null;
  }

  console.log(`[processTransaction] Matched user ${user._id} for source ${source}`);

  // ── Step 2: Find their PENDING deposit ────────────────────────────────
  const pendingDeposits = await DirectDeposit.find({
    userId: user._id,
    status: "PENDING",
    channel,
    amount,
    expiresAt: { $gt: new Date() },
  });

  console.log("[processTransaction] Candidate deposits:", pendingDeposits.length, {
    userId: user._id.toString(),
    channel,
    amount,
  });

  if (pendingDeposits.length === 0) {
    console.warn(`[processTransaction] No PENDING ${channel} deposit for user ${user._id} at ₱${amount}`);
    await flagForReview(raw, "NO_MATCHING_DEPOSIT", user._id);
    return null;
  }

  if (pendingDeposits.length > 1) {
    console.warn(`[processTransaction] Ambiguous: ${pendingDeposits.length} PENDING deposits for user ${user._id} at ₱${amount}`);
    await flagForReview(raw, "AMBIGUOUS_DEPOSIT", user._id);
    return null;
  }

  const deposit = pendingDeposits[0];

  // ── Step 3: Atomic claim ───────────────────────────────────────────────
  const claimed = await DirectDeposit.findOneAndUpdate(
    { _id: deposit._id, status: "PENDING" },
    {
      status: "CREDITED",
      creditedAt: new Date(),
      senderName: senderPhone || senderName || "unknown",
      senderLastFour: senderLastFour || null,
    },
    { new: true }
  );

  if (!claimed) {
    console.log(`[processTransaction] Deposit ${deposit._id} already claimed — skipping.`);
    return { skipped: true, reason: "RACE_CONDITION_ALREADY_CLAIMED", depositId: deposit._id };
  }

  // ── Step 4: Credit the ledger ──────────────────────────────────────────
  try {
    await walletService.credit(user._id.toString(), "PHP", claimed.amount, {
      referenceId: claimed.referenceId,
      description: `PHP deposit ₱${claimed.amount} from ${senderPhone || senderName || "unknown"} (ref: ${claimed.referenceId}, auto-matched)`,
      transactionType: "cashin",
    });

    await archiveDeposit(claimed, "CREDITED", {
      creditedAt: new Date(),
      senderName,
      senderPhone,
    });
  } catch (creditErr) {
    await DirectDeposit.findOneAndUpdate({ _id: claimed._id }, { status: "PENDING" });
    console.error(`[processTransaction] Ledger credit failed, rolled back deposit ${claimed._id}:`, creditErr.message);
    throw creditErr;
  }

  console.log(`[processTransaction] ✅ ₱${claimed.amount} credited to user ${user._id} (ref: ${claimed.referenceId})`);

  // ── Step 5: Emit event ─────────────────────────────────────────────────
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
  } catch (eventErr) {
    console.error("[processTransaction] Failed to emit deposit event (non-fatal):", eventErr.message);
  }

  return {
    success: true,
    referenceId: claimed.referenceId,
    userId: user._id,
    amount: claimed.amount,
    channel: claimed.channel,
  };
}

async function flagForReview(raw, reason, userId = null) {
  try {
    await DepositReview.create({
      userId,
      chain: raw.source || "PHP",
      asset: "PHP",
      amount: raw.amount || 0,
      txHash: raw.referenceId || ("REVIEW-" + Date.now()),
      status: "pending_review",
    });

    await eventStreamService.emit("deposit.flagged", {
      entityId: null,
      userId: userId ? userId.toString() : null,
      reason,
      raw,
    });
  } catch (err) {
    console.error("[processTransaction] Failed to flag for review:", err.message);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
