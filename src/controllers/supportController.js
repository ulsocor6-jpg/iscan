// src/controllers/supportController.js
//
// Client-facing "User Tools" support endpoints. Everything here is
// ownership-scoped to req.user.id (never trust a client-supplied userId).
//
// Two ways in:
//   - Direct REST (lookupWithdrawal/retryWithdrawal/cancelWithdrawal):
//     structured, no LLM involved.
//   - chatSupport: resolves the referenced record the same deterministic
//     way, then hands the real data to an LLM to answer free-form
//     questions. The LLM can only REQUEST retry/cancel via a marker in
//     its reply — it never touches the DB directly. Execution always
//     goes through doRetryWithdrawal/doCancelWithdrawal, the same
//     fund-safety-gated functions the direct REST endpoints use.

import mongoose from "mongoose";
import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import Ledger from "../models/ledgerModel.js";
import { settleCryptoWithdrawal } from "../services/withdrawalProcessor.js";
import { generateSupportResponse } from "../services/support/deterministicSupportService.js";
import investigationService from "../services/support/investigationService.js";

// A withdrawal sitting in "processing" longer than this is treated as
// stuck (most likely a crash between the atomic claim and completion),
// not a normal in-flight state. We do NOT auto-resolve this — it goes to
// admin review, since we can't safely tell from here alone whether the
// on-chain send actually completed before whatever interrupted it.
const STALE_PROCESSING_MS = 5 * 60 * 1000; // 5 minutes

// Two reference formats live in WithdrawalRequest:
//   WD-<mongo _id>   — crypto withdrawals (withdrawalProcessor.js)
//   CO-<hex>          — PHP cashouts (paymentRoutes.js /cashout), stored
//                        in the referenceId field, not derivable from _id.
// Returns a Mongo query filter for whichever format matched, or null.
function buildReferenceQuery(reference, userId) {
  if (!reference) return null;
  const raw = reference.trim();

  if (/^WD-/i.test(raw)) {
    const id = raw.replace(/^WD-/i, "");
    if (!mongoose.isValidObjectId(id)) return null;
    return { _id: id, userId };
  }

  if (/^CO-[0-9a-f]+$/i.test(raw)) {
    return { referenceId: raw.toUpperCase(), userId };
  }

  return null;
}

function describeStatus(withdrawal) {
  const ageMs = Date.now() - new Date(withdrawal.updatedAt || withdrawal.createdAt).getTime();

  switch (withdrawal.status) {
    case "completed":
      return {
        summary: `This withdrawal completed. ${withdrawal.txHash ? `Transaction: ${withdrawal.txHash}` : ""}`,
        canRetry: false,
        stuck: false,
      };

    case "failed":
      return {
        summary: `This withdrawal failed${withdrawal.failReason ? `: ${withdrawal.failReason}` : "."} ` +
                 `No funds were lost — your balance was never debited, or was automatically refunded. ` +
                 `You can retry it, or close it out and start a new withdrawal instead.`,
        canRetry: true,
        canCancel: true,
        stuck: false,
      };

    case "pending_review":
      return {
        summary: "This withdrawal is waiting for review before it settles.",
        canRetry: false,
        stuck: false,
      };

    case "rejected":
      return {
        summary: `This withdrawal was rejected${withdrawal.failReason ? `: ${withdrawal.failReason}` : "."}`,
        canRetry: false,
        stuck: false,
      };

    case "processing":
      if (ageMs > STALE_PROCESSING_MS) {
        return {
          summary: "This withdrawal has been processing longer than expected. " +
                    "I've flagged it for the team to check the actual on-chain status before anything changes — " +
                    "I can't safely auto-resolve this one myself.",
          canRetry: false,
          stuck: true,
        };
      }
      return {
        summary: "This withdrawal is currently processing — check back in a moment.",
        canRetry: false,
        stuck: false,
      };

    default:
      return {
        summary: `Status: ${withdrawal.status}`,
        canRetry: false,
        stuck: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Core action logic — shared by direct REST endpoints AND the chat endpoint.
// Neither the LLM nor any caller decides funds move; this is the only path.
// ---------------------------------------------------------------------------

async function doRetryWithdrawal(withdrawal) {
  if (withdrawal.status !== "failed") {
    return {
      success: false,
      message: withdrawal.status === "processing"
        ? "This withdrawal is still processing or may be stuck — it's been flagged for the team rather than retried automatically."
        : `This withdrawal is currently "${withdrawal.status}" and isn't eligible for self-serve retry.`,
    };
  }

  // PHP cashouts (CO-) settle via a human admin releasing funds, not an
  // on-chain send — settleCryptoWithdrawal() is crypto-only and would
  // misfire here. No self-serve retry path exists yet for PHP.
  if (withdrawal.referenceId?.startsWith("CO-")) {
    return {
      success: false,
      message: "PHP cashout retries aren't self-serve yet — you can cancel this one and submit a new cashout request instead.",
    };
  }

  const result = await settleCryptoWithdrawal(withdrawal);
  return {
    success: result.success,
    message: result.success
      ? "Retry succeeded — your withdrawal is now processing."
      : `Retry failed again: ${result.error}. No funds were lost.`,
    withdrawal: result.withdrawal,
  };
}

async function doCancelWithdrawal(id, userId) {
  const withdrawal = await WithdrawalRequest.findOneAndUpdate(
    { _id: id, userId, status: "failed" },
    { status: "rejected", failReason: "Cancelled by user after failed withdrawal (funds already returned to balance)" },
    { new: true }
  );

  if (!withdrawal) {
    const existing = await WithdrawalRequest.findOne({ _id: id, userId });
    if (!existing) {
      return { success: false, message: "I couldn't find a withdrawal with that reference on your account." };
    }
    return {
      success: false,
      message: `This withdrawal is currently "${existing.status}" and isn't eligible to cancel from here.`,
    };
  }

  return {
    success: true,
    message: "Closed out — your funds are already back in your balance. You can start a new withdrawal anytime.",
    withdrawal,
  };
}

// ---------------------------------------------------------------------------
// Direct REST endpoints
// ---------------------------------------------------------------------------

export async function lookupWithdrawal(req, res) {
  try {
    const query = buildReferenceQuery(req.body.reference, req.user.id);
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid reference (expected format: WD-xxxxxxxx for crypto withdrawals, or CO-xxxxxxxx for PHP cashouts).",
      });
    }

    const withdrawal = await WithdrawalRequest.findOne(query);

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "I couldn't find a withdrawal with that reference on your account.",
      });
    }

    const { summary, canRetry, canCancel, stuck } = describeStatus(withdrawal);

    res.json({
      success: true,
      withdrawal: {
        reference: withdrawal.referenceId || `WD-${withdrawal._id}`,
        status: withdrawal.status,
        asset: withdrawal.asset,
        network: withdrawal.network,
        amount: withdrawal.amount,
        createdAt: withdrawal.createdAt,
      },
      summary,
      canRetry,
      canCancel,
      stuck,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function retryWithdrawal(req, res) {
  try {
    const query = buildReferenceQuery(req.body.reference, req.user.id);
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid reference (expected format: WD-xxxxxxxx for crypto withdrawals, or CO-xxxxxxxx for PHP cashouts).",
      });
    }

    const withdrawal = await WithdrawalRequest.findOne(query);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "I couldn't find a withdrawal with that reference on your account.",
      });
    }

    const result = await doRetryWithdrawal(withdrawal);

    res.json({
      success: result.success,
      message: result.message,
      withdrawal: result.withdrawal
        ? { reference: result.withdrawal.referenceId || `WD-${result.withdrawal._id}`, status: result.withdrawal.status }
        : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function cancelWithdrawal(req, res) {
  try {
    const query = buildReferenceQuery(req.body.reference, req.user.id);
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid reference (expected format: WD-xxxxxxxx for crypto withdrawals, or CO-xxxxxxxx for PHP cashouts).",
      });
    }

    const result = await doCancelWithdrawal(query._id, req.user.id);

    res.json({
      success: result.success,
      message: result.message,
      withdrawal: result.withdrawal
        ? { reference: result.withdrawal.referenceId || `WD-${result.withdrawal._id}`, status: result.withdrawal.status }
        : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ---------------------------------------------------------------------------
// Unified resolver — used only by the chat endpoint. Deterministic
// (regex + ownership-scoped query), never delegated to the LLM.
// ---------------------------------------------------------------------------

async function resolveRecord(reference, userId) {
  if (/^ISCAN-/i.test(reference)) {
    const deposit = await DirectDeposit.findOne({ referenceId: reference.toUpperCase(), userId }).lean();
    if (!deposit) return null;

    return {
      idForActions: deposit._id.toString(),
      recordType: "PHP_DEPOSIT",
      record: {
        reference: deposit.referenceId,
        type: "PHP deposit (cash-in)",
        status: deposit.status,
        amount: deposit.amount,
        channel: deposit.channel,
        expiresAt: deposit.expiresAt,
        createdAt: deposit.createdAt,
        creditedAt: deposit.creditedAt || null,
        canRetry: false,
        canCancel: false,
      },
      canRetry: false,
      canCancel: false,
    };
  }

  const query = buildReferenceQuery(reference, userId);
  if (!query) return null;

  const withdrawal = await WithdrawalRequest.findOne(query).populate("userId", "firstName lastName");
  if (!withdrawal) return null;

  const { summary, canRetry, canCancel } = describeStatus(withdrawal);
  const isPhp = !!withdrawal.referenceId?.startsWith("CO-");

  // For rejected/failed withdrawals, don't assume or stay silent about
  // fund safety — actually check the ledger. Different code paths use
  // different refund referenceId conventions (WD-<id>-REVERSAL,
  // REFUND-<ref>, etc.), so match permissively on any credit entry whose
  // referenceId contains this withdrawal's reference.
  let refundStatus = null;
  if (["rejected", "failed"].includes(withdrawal.status)) {
    const ref = withdrawal.referenceId || `WD-${withdrawal._id}`;
    const refundEntry = await Ledger.findOne({
      userId: withdrawal.userId,
      referenceId: { $regex: ref, $options: "i" },
      credit: { $gt: 0 },
    }).sort({ createdAt: -1 }).lean();

    refundStatus = {
      confirmed: !!refundEntry,
      refundedAt: refundEntry?.createdAt || null,
    };
  }

  const ownerName = withdrawal.userId?.firstName
    ? `${withdrawal.userId.firstName} ${withdrawal.userId.lastName || ""}`.toLowerCase().trim()
    : null;
  const accountName = (withdrawal.accountName || "").toLowerCase().trim();
  const nameMismatch = !!(accountName && ownerName && accountName !== ownerName);

  return {
    idForActions: withdrawal._id.toString(),
    recordType: "WITHDRAWAL",
    record: {
      reference: withdrawal.referenceId || `WD-${withdrawal._id}`,
      type: isPhp ? "PHP cashout (withdrawal)" : "Crypto withdrawal",
      status: withdrawal.status,
      summary,
      accountName: withdrawal.accountName || null,
      nameMismatch,
      asset: withdrawal.asset,
      network: withdrawal.network || null,
      amount: withdrawal.amount,
      fee: withdrawal.fee || 0,
      netAmount: withdrawal.netAmount ?? withdrawal.amount,
      destination: withdrawal.destinationAddress || withdrawal.destinationAccount || null,
      txHash: withdrawal.txHash || null,
      failReason: withdrawal.failReason || null,
      expiresAt: withdrawal.expiresAt || null,
      createdAt: withdrawal.createdAt,
      refundConfirmed: refundStatus?.confirmed ?? null,
      refundedAt: refundStatus?.refundedAt ?? null,
      canRetry: !!canRetry && !isPhp,
      canCancel: !!canCancel,
    },
    canRetry: !!canRetry && !isPhp,
    canCancel: !!canCancel,
  };
}

// ---------------------------------------------------------------------------
// Chat endpoint
// ---------------------------------------------------------------------------

export async function chatSupport(req, res) {
  try {
    const { message, history, reference: stickyReference } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ success: false, message: "message is required" });
    }

    const refMatch = message.match(/\b(WD|CO|ISCAN)-[A-Za-z0-9]+\b/i);
    const reference = refMatch ? refMatch[0].toUpperCase() : stickyReference;

    if (!reference) {
      return res.json({
        success: true,
        text: "Give me a reference number and I can look into it — starts with WD- for crypto withdrawals, CO- for PHP cashouts, or ISCAN- for PHP deposits.",
        reference: null,
      });
    }

    const resolved = await resolveRecord(reference, req.user.id);
    if (!resolved) {
      return res.json({
        success: true,
        text: `I couldn't find "${reference}" on your account — double check the reference number.`,
        reference: null,
      });
    }

    const investigation = await investigationService.investigateUser(req.user.id);

    const llmResult = generateSupportResponse({
      record: resolved.record,
      recordType: resolved.recordType,
      userMessage: message,
      investigationState: investigation.state,
    });

    let actionMessage = null;
    if (llmResult.action === "RETRY" && resolved.canRetry && resolved.recordType === "WITHDRAWAL") {
      const withdrawal = await WithdrawalRequest.findOne({ _id: resolved.idForActions, userId: req.user.id });
      const result = await doRetryWithdrawal(withdrawal);
      actionMessage = result.message;
    } else if (llmResult.action === "CANCEL" && resolved.canCancel && resolved.recordType === "WITHDRAWAL") {
      const result = await doCancelWithdrawal(resolved.idForActions, req.user.id);
      actionMessage = result.message;
    }

    res.json({
      success: true,
      text: actionMessage ? `${llmResult.text}\n\n${actionMessage}` : llmResult.text,
      reference,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
