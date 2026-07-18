// src/controllers/supportController.js
//
// Client-facing "User Tools" support endpoints. Everything here is
// ownership-scoped to req.user.id (never trust a client-supplied userId)
// and deliberately narrow in what actions it can take — see
// STALE_PROCESSING_MS and the retry gate below for the fund-safety
// reasoning.

import mongoose from "mongoose";
import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import { settleCryptoWithdrawal } from "../services/withdrawalProcessor.js";

// A withdrawal sitting in "processing" longer than this is treated as
// stuck (most likely a crash between the atomic claim and completion),
// not a normal in-flight state. We do NOT auto-resolve this — it goes to
// admin review, since we can't safely tell from here alone whether the
// on-chain send actually completed before whatever interrupted it.
const STALE_PROCESSING_MS = 5 * 60 * 1000; // 5 minutes

// Two reference formats both live in WithdrawalRequest:
//   WD-<mongo _id>   — crypto withdrawals (withdrawalProcessor.js)
//   CO-<hex>          — PHP cashouts (paymentRoutes.js /cashout), stored
//                        in the referenceId field, not derivable from _id.
// Returns a Mongo query filter for whichever format matched, or null if
// the input matches neither shape.
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

export async function lookupWithdrawal(req, res) {
  try {
    // Ownership check is the whole point — userId comes from the auth
    // cookie via req.user, never from the request body. It's baked into
    // the query filter itself here, not applied after the fact.
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

    const { summary, canRetry, stuck } = describeStatus(withdrawal);

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
      stuck,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function cancelWithdrawal(req, res) {
  try {
    const id = parseReference(req.body.reference);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid withdrawal reference (expected format: WD-xxxxxxxx).",
      });
    }

    // Same fund-safety gate as retry — only ever act on "failed", where
    // the balance is already guaranteed whole. "Cancel" here just closes
    // the record out (reusing the existing "rejected" status, same
    // pattern used elsewhere in this codebase) so it's not left
    // ambiguously sitting there, and won't get swept up by any future
    // automated retry pass. It does NOT move any funds — the reversal
    // already happened when the withdrawal failed.
    const withdrawal = await WithdrawalRequest.findOneAndUpdate(
      { ...query, status: "failed" },
      { status: "rejected", failReason: "Cancelled by user after failed withdrawal (funds already returned to balance)" },
      { new: true }
    );

    if (!withdrawal) {
      const existing = await WithdrawalRequest.findOne(query);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "I couldn't find a withdrawal with that reference on your account.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `This withdrawal is currently "${existing.status}" and isn't eligible to cancel from here.`,
      });
    }

    res.json({
      success: true,
      message: "Closed out — your funds are already back in your balance. You can start a new withdrawal anytime.",
      withdrawal: {
        reference: withdrawal.referenceId || `WD-${withdrawal._id}`,
        status: withdrawal.status,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function retryWithdrawal(req, res) {
  try {
    const id = parseReference(req.body.reference);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid withdrawal reference (expected format: WD-xxxxxxxx).",
      });
    }

    const withdrawal = await WithdrawalRequest.findOne({
      _id: id,
      userId: req.user.id,
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "I couldn't find a withdrawal with that reference on your account.",
      });
    }

    // Fund-safety gate: only ever retry from "failed". Both existing
    // failure paths in withdrawalProcessor.js guarantee the user's
    // balance is whole again by this point (debit never happened, or was
    // reversed) — that guarantee is what makes self-serve retry safe
    // without a human in the loop. "processing"/"pending_review" are
    // deliberately NOT retryable here even though settleCryptoWithdrawal's
    // own claim-guard would reject a concurrent one anyway — we don't
    // want to give a stuck "processing" record a retry button at all.
    if (withdrawal.status !== "failed") {
      return res.status(400).json({
        success: false,
        message: withdrawal.status === "processing"
          ? "This withdrawal is still processing or may be stuck — it's been flagged for the team rather than retried automatically."
          : `This withdrawal is currently "${withdrawal.status}" and isn't eligible for self-serve retry.`,
      });
    }

    // PHP cashouts (CO-) settle via a human admin releasing funds, not
    // an on-chain send — settleCryptoWithdrawal() is crypto-only and
    // would misfire here. No self-serve retry path exists yet for PHP;
    // route them to cancel instead.
    if (withdrawal.referenceId?.startsWith("CO-")) {
      return res.status(400).json({
        success: false,
        message: "PHP cashout retries aren't self-serve yet — you can cancel this one and submit a new cashout request instead.",
      });
    }

    const result = await settleCryptoWithdrawal(withdrawal);

    res.json({
      success: result.success,
      message: result.success
        ? "Retry succeeded — your withdrawal is now processing."
        : `Retry failed again: ${result.error}. No funds were lost.`,
      withdrawal: {
        reference: withdrawal.referenceId || `WD-${withdrawal._id}`,
        status: result.withdrawal.status,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
