#!/usr/bin/env python3
"""
Patch: wire depositVerificationService.js — the actual auto-matching logic
behind Maya/GCash/Bank deposit notifications — into blockchainInspector.
This file previously had zero logging of any kind (not even console),
meaning every SENDER_MISMATCH / NO_ACTIVE_REQUEST / AMOUNT_MISMATCH was
completely invisible to the operator.

Run from repo root:  python3 patch_inspector_depositverification.py
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


DVS = "src/services/depositVerificationService.js"

patch(DVS,
    '''import DepositVerificationLog from "../models/DepositVerificationLog.js";''',
    '''import DepositVerificationLog from "../models/DepositVerificationLog.js";
import inspector from "./blockchain/inspector/blockchainInspector.js";''',
    "import inspector",
    'import inspector from "./blockchain/inspector/blockchainInspector.js"'
)

patch(DVS,
    '''if (!wallet) {
  await DepositVerificationLog.create({
    senderAccount,
    receiverAccount,
    receivedAmount: amount,
    channel,
    verificationResult: "SENDER_MISMATCH",
    rawPayload: payload
  });
  return {
    matched:false,
    code:"SENDER_MISMATCH"
  };
}''',
    '''if (!wallet) {
  await DepositVerificationLog.create({
    senderAccount,
    receiverAccount,
    receivedAmount: amount,
    channel,
    verificationResult: "SENDER_MISMATCH",
    rawPayload: payload
  });
  inspector.warn("php-deposit", `Deposit notification sender not linked to any wallet: ${senderAccount} via ${channel}`, {
    senderAccount, receiverAccount, amount, channel,
    step: "verify-sender",
  });
  return {
    matched:false,
    code:"SENDER_MISMATCH"
  };
}''',
    "inspector.warn on SENDER_MISMATCH",
    'inspector.warn("php-deposit", `Deposit notification sender not linked'
)

patch(DVS,
    '''  if (!deposit) {
    await DepositVerificationLog.create({
      senderAccount,
      receiverAccount,
      receivedAmount: amount,
      channel,
      verificationResult: "NO_ACTIVE_REQUEST",
      rawPayload: payload
    });
    return {
      matched: false,
      code: "NO_ACTIVE_REQUEST"
    };
  }''',
    '''  if (!deposit) {
    await DepositVerificationLog.create({
      senderAccount,
      receiverAccount,
      receivedAmount: amount,
      channel,
      verificationResult: "NO_ACTIVE_REQUEST",
      rawPayload: payload
    });
    inspector.warn("php-deposit", `Payment received for ${wallet.userId} with no active deposit request: ${amount} via ${channel}`, {
      userId: wallet.userId, senderAccount, receiverAccount, amount, channel,
      step: "verify-match",
    });
    return {
      matched: false,
      code: "NO_ACTIVE_REQUEST"
    };
  }''',
    "inspector.warn on NO_ACTIVE_REQUEST",
    'inspector.warn("php-deposit", `Payment received for'
)

patch(DVS,
    '''    return {
      matched: false,
      code: "AMOUNT_MISMATCH",
      deposit
    };
  }''',
    '''    inspector.error("php-deposit", `Amount mismatch for ${deposit.referenceId}: requested ${deposit.amount}, received ${amount}`, {
      orderId: deposit.referenceId,
      userId: deposit.userId,
      requestedAmount: deposit.amount,
      receivedAmount: amount,
      channel,
      step: "verify-amount",
    });
    return {
      matched: false,
      code: "AMOUNT_MISMATCH",
      deposit
    };
  }''',
    "inspector.error on AMOUNT_MISMATCH",
    'inspector.error("php-deposit", `Amount mismatch for'
)

patch(DVS,
    '''  deposit.status = "CREDITED";
  deposit.verificationResult = "MATCHED";
  deposit.creditedAt = new Date();
  await deposit.save();
  return {
    matched: true,
    code: "MATCHED",
    deposit
  };
}''',
    '''  deposit.status = "CREDITED";
  deposit.verificationResult = "MATCHED";
  deposit.creditedAt = new Date();
  await deposit.save();
  inspector.success("php-deposit", `Auto-matched and credited ${amount} PHP for ${deposit.referenceId}`, {
    orderId: deposit.referenceId,
    userId: deposit.userId,
    amount,
    channel,
    step: "credited",
  });
  return {
    matched: true,
    code: "MATCHED",
    deposit
  };
}''',
    "inspector.success on MATCHED",
    'inspector.success("php-deposit", `Auto-matched'
)


# ---------------------------------------------------------------------------
# knowledgeBase.js — verification failure rules
# ---------------------------------------------------------------------------
KB = "src/services/operator/knowledgeBase.js"

patch(KB,
    '''  // ==========================================================
  // PHP DEPOSIT (cash-in via GCash/Maya/Bank)
  // ==========================================================''',
    '''  // ==========================================================
  // PHP DEPOSIT (cash-in via GCash/Maya/Bank)
  // ==========================================================

  {
    code: "DEPOSIT_SENDER_MISMATCH",
    title: "Deposit Sender Not Linked",
    patterns: [
      "deposit notification sender not linked to any wallet"
    ],
    severity: "WARNING",
    confidence: 85,
    recommendation: "A payment came in from an account that isn't linked to any user. Could be a typo on the sender's end, or an unrelated payment — check DepositVerificationLog for the raw payload."
  },

  {
    code: "DEPOSIT_NO_ACTIVE_REQUEST",
    title: "Deposit With No Active Request",
    patterns: [
      "payment received for.*with no active deposit request"
    ],
    severity: "WARNING",
    confidence: 88,
    recommendation: "User sent money without an active cash-in request (expired, or never created one). Funds landed but weren't auto-credited — needs manual review."
  },

  {
    code: "DEPOSIT_AMOUNT_MISMATCH",
    title: "Deposit Amount Mismatch",
    patterns: [
      "amount mismatch for"
    ],
    severity: "HIGH",
    confidence: 93,
    recommendation: "User sent a different amount than requested — deposit is now PENDING_REVIEW, needs admin to confirm or reject manually."
  },''',
    "add verification-failure rules for PHP deposit auto-matching",
    'code: "DEPOSIT_SENDER_MISMATCH"'
)

print("\nDone. Next: node --check src/services/depositVerificationService.js, then git --no-pager diff.")
