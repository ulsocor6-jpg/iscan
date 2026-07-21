#!/usr/bin/env python3
"""
Patch:
1. Add cancelWithdrawal to supportController.js — lets the user explicitly
   close out a "failed" withdrawal instead of retrying, so it stops
   sitting ambiguously. Reuses the existing "rejected" status rather than
   adding a new enum value (same minimal-footprint approach used
   elsewhere in this codebase, e.g. admin/cancel reusing "EXPIRED").
2. Wire it into supportRoutes.js.
3. Mount supportRoutes in app.js.

Run from repo root:  python3 patch_support_cancel_and_mount.py
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
# 1. supportController.js — add cancelWithdrawal
# ---------------------------------------------------------------------------
SC = "src/controllers/supportController.js"

patch(SC,
    '''export async function retryWithdrawal(req, res) {''',
    '''export async function cancelWithdrawal(req, res) {
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
      { _id: id, userId: req.user.id, status: "failed" },
      { status: "rejected", failReason: "Cancelled by user after failed withdrawal (funds already returned to balance)" },
      { new: true }
    );

    if (!withdrawal) {
      const existing = await WithdrawalRequest.findOne({ _id: id, userId: req.user.id });
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
        reference: `WD-${withdrawal._id}`,
        status: withdrawal.status,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function retryWithdrawal(req, res) {''',
    "add cancelWithdrawal controller function",
    "export async function cancelWithdrawal(req, res) {"
)


# ---------------------------------------------------------------------------
# 2. supportRoutes.js — wire cancel route
# ---------------------------------------------------------------------------
SR = "src/routes/supportRoutes.js"

patch(SR,
    '''import { lookupWithdrawal, retryWithdrawal } from "../controllers/supportController.js";''',
    '''import { lookupWithdrawal, retryWithdrawal, cancelWithdrawal } from "../controllers/supportController.js";''',
    "import cancelWithdrawal",
    "retryWithdrawal, cancelWithdrawal }"
)

patch(SR,
    '''router.post("/withdrawals/retry", requireAuth, retryWithdrawal);''',
    '''router.post("/withdrawals/retry", requireAuth, retryWithdrawal);
router.post("/withdrawals/cancel", requireAuth, cancelWithdrawal);''',
    "add cancel route",
    'router.post("/withdrawals/cancel"'
)

# also update describeStatus's canRetry-only shape to let the frontend know
# cancel is always offered alongside retry when canRetry is true
patch(SC,
    '''      return {
        summary: `This withdrawal failed${withdrawal.failReason ? `: ${withdrawal.failReason}` : "."} ` +
                 `No funds were lost — your balance was never debited, or was automatically refunded. You can retry it.`,
        canRetry: true,
        stuck: false,
      };''',
    '''      return {
        summary: `This withdrawal failed${withdrawal.failReason ? `: ${withdrawal.failReason}` : "."} ` +
                 `No funds were lost — your balance was never debited, or was automatically refunded. ` +
                 `You can retry it, or close it out and start a new withdrawal instead.`,
        canRetry: true,
        canCancel: true,
        stuck: false,
      };''',
    "surface canCancel alongside canRetry in lookup response",
    "canCancel: true,"
)


# ---------------------------------------------------------------------------
# 3. app.js — mount supportRoutes
# ---------------------------------------------------------------------------
APP = "app.js"

patch(APP,
    '''import operatorRoutes from "./src/routes/operator/operatorRoutes.js";
import intelligenceRoutes from "./src/routes/intelligence/intelligenceRoutes.js";''',
    '''import operatorRoutes from "./src/routes/operator/operatorRoutes.js";
import intelligenceRoutes from "./src/routes/intelligence/intelligenceRoutes.js";
import supportRoutes from "./src/routes/supportRoutes.js";''',
    "import supportRoutes",
    'import supportRoutes from "./src/routes/supportRoutes.js"'
)

patch(APP,
    '''app.use(
 "/api/v1/operator",
 operatorRoutes
);''',
    '''app.use(
 "/api/v1/operator",
 operatorRoutes
);

app.use(
 "/api/v1/support",
 supportRoutes
);''',
    "mount supportRoutes",
    '"/api/v1/support"'
)

print("\nDone. Next: node --check app.js src/controllers/supportController.js src/routes/supportRoutes.js")
