#!/usr/bin/env python3
"""
Patch:
1. Delete src/controllers/cashoutController.js — confirmed dead (1-byte
   file, never imported/routed anywhere).
2. Extend supportController.js's reference parsing to also match PHP
   cashout references (CO-xxx, stored in referenceId field) alongside
   crypto withdrawal references (WD-<mongo _id>) — both live in the same
   WithdrawalRequest model.

Run from repo root:  python3 patch_support_co_references_cleanup.py
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
# 1. Delete dead cashoutController.js
# ---------------------------------------------------------------------------
CC = Path("src/controllers/cashoutController.js")
if CC.exists():
    CC.unlink()
    print(f"OK: deleted {CC} (confirmed dead — empty, unrouted)")
else:
    print(f"  skip: {CC} already gone")


# ---------------------------------------------------------------------------
# 2. supportController.js — handle both WD- (parsed _id) and CO- (referenceId)
# ---------------------------------------------------------------------------
SC = "src/controllers/supportController.js"

patch(SC,
    '''function parseReference(reference) {
  if (!reference) return null;
  const raw = reference.trim().replace(/^WD-/i, "");
  return mongoose.isValidObjectId(raw) ? raw : null;
}''',
    '''// Two reference formats both live in WithdrawalRequest:
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
}''',
    "replace parseReference with buildReferenceQuery covering both formats",
    "function buildReferenceQuery(reference, userId) {"
)

patch(SC,
    '''export async function lookupWithdrawal(req, res) {
  try {
    const id = parseReference(req.body.reference);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid withdrawal reference (expected format: WD-xxxxxxxx).",
      });
    }

    // Ownership check is the whole point — userId comes from the auth
    // cookie via req.user, never from the request body.
    const withdrawal = await WithdrawalRequest.findOne({
      _id: id,
      userId: req.user.id,
    });''',
    '''export async function lookupWithdrawal(req, res) {
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

    const withdrawal = await WithdrawalRequest.findOne(query);''',
    "update lookupWithdrawal to use buildReferenceQuery",
    "const query = buildReferenceQuery(req.body.reference, req.user.id);"
)

patch(SC,
    '''    res.json({
      success: true,
      withdrawal: {
        reference: `WD-${withdrawal._id}`,
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
    }''',
    '''    res.json({
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
    const query = buildReferenceQuery(req.body.reference, req.user.id);
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid reference (expected format: WD-xxxxxxxx for crypto withdrawals, or CO-xxxxxxxx for PHP cashouts).",
      });
    }
    const id = query._id;''',
    "update cancelWithdrawal to use buildReferenceQuery (id may be undefined for CO- refs — see next patch)",
    "const query = buildReferenceQuery(req.body.reference, req.user.id);\n    if (!query) {\n      return res.status(400).json({\n        success: false,\n        message: \"That doesn't look like a valid reference"
)

# cancelWithdrawal's findOneAndUpdate currently filters by { _id: id, ... }
# — needs to use the full query (which may be { referenceId, userId } for
# CO- refs, where there is no separately-known id) instead.
patch(SC,
    '''    const withdrawal = await WithdrawalRequest.findOneAndUpdate(
      { _id: id, userId: req.user.id, status: "failed" },
      { status: "rejected", failReason: "Cancelled by user after failed withdrawal (funds already returned to balance)" },
      { new: true }
    );

    if (!withdrawal) {
      const existing = await WithdrawalRequest.findOne({ _id: id, userId: req.user.id });''',
    '''    const withdrawal = await WithdrawalRequest.findOneAndUpdate(
      { ...query, status: "failed" },
      { status: "rejected", failReason: "Cancelled by user after failed withdrawal (funds already returned to balance)" },
      { new: true }
    );

    if (!withdrawal) {
      const existing = await WithdrawalRequest.findOne(query);''',
    "fix cancelWithdrawal's findOneAndUpdate to use the full reference query",
    "{ ...query, status: \"failed\" },"
)

patch(SC,
    '''    res.json({
      success: true,
      message: "Closed out — your funds are already back in your balance. You can start a new withdrawal anytime.",
      withdrawal: {
        reference: `WD-${withdrawal._id}`,
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
    });''',
    '''    res.json({
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
    const query = buildReferenceQuery(req.body.reference, req.user.id);
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid reference (expected format: WD-xxxxxxxx for crypto withdrawals, or CO-xxxxxxxx for PHP cashouts).",
      });
    }

    const withdrawal = await WithdrawalRequest.findOne(query);''',
    "update retryWithdrawal to use buildReferenceQuery",
    "const query = buildReferenceQuery(req.body.reference, req.user.id);\n    if (!query) {"
)

# Safety gate: settleCryptoWithdrawal() calls sendCryptoToAddress() —
# retrying a CO- (PHP cashout) reference through it would attempt to send
# crypto for what's actually a fiat transaction. Block it explicitly
# rather than let it silently misfire, until a PHP-specific retry path
# exists.
patch(SC,
    '''    if (withdrawal.status !== "failed") {
      return res.status(400).json({
        success: false,
        message: withdrawal.status === "processing"
          ? "This withdrawal is still processing or may be stuck — it's been flagged for the team rather than retried automatically."
          : `This withdrawal is currently "${withdrawal.status}" and isn't eligible for self-serve retry.`,
      });
    }

    const result = await settleCryptoWithdrawal(withdrawal);''',
    '''    if (withdrawal.status !== "failed") {
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

    const result = await settleCryptoWithdrawal(withdrawal);''',
    "block PHP (CO-) references from the crypto-only retry path",
    'if (withdrawal.referenceId?.startsWith("CO-")) {'
)

patch(SC,
    '''    res.json({
      success: result.success,
      message: result.success
        ? "Retry succeeded — your withdrawal is now processing."
        : `Retry failed again: ${result.error}. No funds were lost.`,
      withdrawal: {
        reference: `WD-${withdrawal._id}`,
        status: result.withdrawal.status,
      },
    });''',
    '''    res.json({
      success: result.success,
      message: result.success
        ? "Retry succeeded — your withdrawal is now processing."
        : `Retry failed again: ${result.error}. No funds were lost.`,
      withdrawal: {
        reference: withdrawal.referenceId || `WD-${withdrawal._id}`,
        status: result.withdrawal.status,
      },
    });''',
    "use referenceId in retry response too",
    'reference: withdrawal.referenceId || `WD-${withdrawal._id}`,\n        status: result.withdrawal.status,'
)

print("\nDone. Next: node --check src/controllers/supportController.js, then git --no-pager diff.")
print("Lookup and cancel work for both WD- and CO- references. Retry is")
print("gated to WD- (crypto) only — CO- retries are explicitly rejected")
print("with a message pointing to cancel, since PHP cashouts settle via")
print("admin release, not an on-chain send, and have no self-serve retry")
print("path yet.")
