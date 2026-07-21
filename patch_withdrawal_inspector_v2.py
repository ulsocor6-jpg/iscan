#!/usr/bin/env python3
"""
Patch: wire withdrawalProcessor.js into blockchainInspector.
Tries each anchor with AND without a blank line before eventStreamService.emit,
since the file has inconsistent blank-line spacing that got lost in earlier
terminal paste round-trips.

Run from repo root:  python3 patch_withdrawal_inspector_v2.py
"""
import sys
from pathlib import Path

def try_patch(text, candidates, new, label):
    """candidates: list of possible old strings, try each in order."""
    for old in candidates:
        count = text.count(old)
        if count == 1:
            print(f"  matched variant for: {label}")
            return text.replace(old, new)
        if count > 1:
            print(f"ABORT: anchor matched {count} times (expected 1) — {label}")
            sys.exit(1)
    print(f"ABORT: no variant matched — {label}")
    for i, old in enumerate(candidates):
        print(f"----- candidate {i} -----")
        print(repr(old))
    sys.exit(1)


WP = "src/services/withdrawalProcessor.js"
p = Path(WP)
if not p.exists():
    print(f"ABORT: {WP} does not exist")
    sys.exit(1)
text = p.read_text()

# --- import line ---
if "import inspector from \"./blockchain/inspector/blockchainInspector.js\";" in text:
    print("  import inspector already present, skipping")
else:
    text = try_patch(
        text,
        ['''import walletService from "./walletService.js";
import { sendCryptoToAddress } from "./treasury/treasurySendService.js";
import eventStreamService from "./eventStreamService.js";
import { sendTelegramAlert } from "./telegramAlertService.js";'''],
        '''import walletService from "./walletService.js";
import { sendCryptoToAddress } from "./treasury/treasurySendService.js";
import eventStreamService from "./eventStreamService.js";
import { sendTelegramAlert } from "./telegramAlertService.js";
import inspector from "./blockchain/inspector/blockchainInspector.js";''',
        "import inspector"
    )

# --- debit failure block ---
if 'inspector.error("withdrawal", `Debit failed' not in text:
    text = try_patch(
        text,
        [
            '''    withdrawal.status = "failed";
    withdrawal.failReason = debitErr.message;
    await withdrawal.save();

    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: debitErr.message,
      stage: "debit",
    });''',
            '''    withdrawal.status = "failed";
    withdrawal.failReason = debitErr.message;
    await withdrawal.save();
    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: debitErr.message,
      stage: "debit",
    });''',
        ],
        '''    withdrawal.status = "failed";
    withdrawal.failReason = debitErr.message;
    await withdrawal.save();
    inspector.error("withdrawal", `Debit failed for WD-${withdrawal._id}: ${debitErr.message}`, {
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
    });''',
        "debit failure block"
    )
else:
    print("  debit failure block already patched, skipping")

# --- send failure block ---
if 'inspector.error("withdrawal", `Send failed' not in text:
    text = try_patch(
        text,
        [
            '''    withdrawal.status = "failed";
    withdrawal.failReason = sendErr.message;
    await withdrawal.save();

    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: sendErr.message,
    });''',
            '''    withdrawal.status = "failed";
    withdrawal.failReason = sendErr.message;
    await withdrawal.save();
    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: sendErr.message,
    });''',
        ],
        '''    withdrawal.status = "failed";
    withdrawal.failReason = sendErr.message;
    await withdrawal.save();
    inspector.error("withdrawal", `Send failed for WD-${withdrawal._id}: ${sendErr.message}`, {
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
    });''',
        "send failure block"
    )
else:
    print("  send failure block already patched, skipping")

# --- completed block ---
if 'inspector.success("withdrawal", `WD-' not in text:
    text = try_patch(
        text,
        [
            '''    withdrawal.status = "completed";
    withdrawal.txHash = result.txHash;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    await eventStreamService.emit("withdrawal.completed", {''',
            '''    withdrawal.status = "completed";
    withdrawal.txHash = result.txHash;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();
    await eventStreamService.emit("withdrawal.completed", {''',
        ],
        '''    withdrawal.status = "completed";
    withdrawal.txHash = result.txHash;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();
    inspector.success("withdrawal", `WD-${withdrawal._id} settled`, {
      orderId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      txHash: result.txHash,
    });
    await eventStreamService.emit("withdrawal.completed", {''',
        "completed block"
    )
else:
    print("  completed block already patched, skipping")

p.write_text(text)
print(f"\nOK: patched {WP}")
print("Next: node --check src/services/withdrawalProcessor.js, then git --no-pager diff")
