#!/usr/bin/env python3
"""
Patch: for "rejected" or "failed" withdrawals, actually check the Ledger
for a confirmed refund/reversal entry instead of staying silent (rejected)
or assuming (failed said "was automatically refunded" without checking).
Refund lookups match by referenceId containing the withdrawal's reference
string, since different code paths use different suffixes
(-REVERSAL, REFUND-, etc.) — this is deliberately permissive rather than
requiring one exact convention.

Run from repo root:  python3 patch_verify_refund_status.py
"""
import sys
from pathlib import Path

def patch(path, old, new, label, already_marker):
    p = Path(path)
    if not p.exists():
        print(f"ABORT: {path} does not exist")
        sys.exit(1)
    text = p.read_text()
    if already_marker in text:
        print(f"  skip (already patched): {label}")
        return
    count = text.count(old)
    if count == 0:
        print(f"ABORT: anchor not found in {path} — {label}")
        print(repr(old))
        sys.exit(1)
    if count > 1:
        print(f"ABORT: anchor matched {count} times — {label}")
        sys.exit(1)
    p.write_text(text.replace(old, new))
    print(f"OK: {label}")


# ---------------------------------------------------------------------------
# 1. supportController.js — check Ledger for an actual refund entry
# ---------------------------------------------------------------------------
SC = "src/controllers/supportController.js"

patch(SC,
    '''import mongoose from "mongoose";
import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";''',
    '''import mongoose from "mongoose";
import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import Ledger from "../models/ledgerModel.js";''',
    "import Ledger",
    'import Ledger from "../models/ledgerModel.js"'
)

# Verify refund status for the WITHDRAWAL branch of resolveRecord, right
# before building the returned record — needs to run for both
# "rejected" and "failed" so the chat can state fund-safety as a checked
# fact, not an assumption.
patch(SC,
    '''  const { summary, canRetry, canCancel } = describeStatus(withdrawal);
  const isPhp = !!withdrawal.referenceId?.startsWith("CO-");''',
    '''  const { summary, canRetry, canCancel } = describeStatus(withdrawal);
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
  }''',
    "add refund verification for rejected/failed withdrawals",
    "let refundStatus = null;"
)

patch(SC,
    '''      expiresAt: withdrawal.expiresAt || null,
      createdAt: withdrawal.createdAt,
      canRetry: !!canRetry && !isPhp, // PHP retry is blocked in doRetryWithdrawal too; keep the LLM's view consistent
      canCancel: !!canCancel,
    },''',
    '''      expiresAt: withdrawal.expiresAt || null,
      createdAt: withdrawal.createdAt,
      refundConfirmed: refundStatus?.confirmed ?? null,
      refundedAt: refundStatus?.refundedAt ?? null,
      canRetry: !!canRetry && !isPhp, // PHP retry is blocked in doRetryWithdrawal too; keep the LLM's view consistent
      canCancel: !!canCancel,
    },''',
    "surface refundConfirmed/refundedAt on the record",
    "refundConfirmed: refundStatus?.confirmed ?? null,"
)


# ---------------------------------------------------------------------------
# 2. deterministicSupportService.js — state refund status as a checked
#    fact for rejected/failed withdrawals
# ---------------------------------------------------------------------------
DS = "src/services/support/deterministicSupportService.js"

patch(DS,
    '''  if (recordType === "WITHDRAWAL" && record.nameMismatch) {
    text += `This one's on hold because the receiving account name ("${record.accountName}") ` +
            `doesn't match the name on your account. The team reviews these manually before releasing funds — ` +
            `if that name is correct (e.g. a spouse or family member's account), let support know so it can be verified. `;
  }''',
    '''  if (recordType === "WITHDRAWAL" && record.nameMismatch) {
    text += `This one's on hold because the receiving account name ("${record.accountName}") ` +
            `doesn't match the name on your account. The team reviews these manually before releasing funds — ` +
            `if that name is correct (e.g. a spouse or family member's account), let support know so it can be verified. `;
  }

  // State refund status as a checked fact, not an assumption — see
  // resolveRecord's Ledger lookup in supportController.js.
  if (recordType === "WITHDRAWAL" && ["rejected", "failed"].includes(record.status)) {
    if (record.refundConfirmed) {
      text += `Your funds were refunded back to your balance${record.refundedAt ? ` on ${new Date(record.refundedAt).toLocaleDateString("en-PH")}` : ""}. `;
    } else if (record.refundConfirmed === false) {
      text += `I don't see a confirmed refund on record for this one yet — I've flagged it for the team to double check your balance rather than assume. `;
    }
  }''',
    "state refund status explicitly for rejected/failed withdrawals",
    "State refund status as a checked fact"
)

print("\nDone. Next: node --check both files, then restart the server and test in the UI.")
