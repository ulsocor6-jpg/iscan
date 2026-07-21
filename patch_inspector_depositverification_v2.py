#!/usr/bin/env python3
"""
Patch: wire depositVerificationService.js into blockchainInspector.
All anchors verified against actual file content via repr() dumps.
Idempotent — safe to re-run, skips anything already patched.

Run from repo root:  python3 patch_inspector_depositverification_v2.py
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
    'if (!wallet) {\n\n  await DepositVerificationLog.create({\n    senderAccount,\n    receiverAccount,\n    receivedAmount: amount,\n    channel,\n    verificationResult: "SENDER_MISMATCH",\n    rawPayload: payload\n  });\n\n  return {\n    matched:false,\n    code:"SENDER_MISMATCH"\n  };\n}',
    'if (!wallet) {\n\n  await DepositVerificationLog.create({\n    senderAccount,\n    receiverAccount,\n    receivedAmount: amount,\n    channel,\n    verificationResult: "SENDER_MISMATCH",\n    rawPayload: payload\n  });\n\n  inspector.warn("php-deposit", `Deposit notification sender not linked to any wallet: ${senderAccount} via ${channel}`, {\n    senderAccount, receiverAccount, amount, channel,\n    step: "verify-sender",\n  });\n\n  return {\n    matched:false,\n    code:"SENDER_MISMATCH"\n  };\n}',
    "inspector.warn on SENDER_MISMATCH",
    'inspector.warn("php-deposit", `Deposit notification sender not linked'
)

patch(DVS,
    'if (!deposit) {\n\n    await DepositVerificationLog.create({\n      senderAccount,\n      receiverAccount,\n      receivedAmount: amount,\n      channel,\n      verificationResult: "NO_ACTIVE_REQUEST",\n      rawPayload: payload\n    });\n\n    return {\n      matched: false,\n      code: "NO_ACTIVE_REQUEST"\n    };\n  }',
    'if (!deposit) {\n\n    await DepositVerificationLog.create({\n      senderAccount,\n      receiverAccount,\n      receivedAmount: amount,\n      channel,\n      verificationResult: "NO_ACTIVE_REQUEST",\n      rawPayload: payload\n    });\n\n    inspector.warn("php-deposit", `Payment received for ${wallet.userId} with no active deposit request: ${amount} via ${channel}`, {\n      userId: wallet.userId, senderAccount, receiverAccount, amount, channel,\n      step: "verify-match",\n    });\n\n    return {\n      matched: false,\n      code: "NO_ACTIVE_REQUEST"\n    };\n  }',
    "inspector.warn on NO_ACTIVE_REQUEST",
    'inspector.warn("php-deposit", `Payment received for'
)

patch(DVS,
    'if (deposit.amount !== amount) {\n\n    deposit.status = "PENDING_REVIEW";\n    deposit.verificationResult = "AMOUNT_MISMATCH";\n    await deposit.save();\n\n    await DepositVerificationLog.create({\n      referenceId: deposit.referenceId,\n      userId: deposit.userId,\n      senderAccount,\n      receiverAccount,\n      requestedAmount: deposit.amount,\n      receivedAmount: amount,\n      channel,\n      verificationResult: "AMOUNT_MISMATCH",\n      rawPayload: payload\n    });\n\n    return {\n      matched: false,\n      code: "AMOUNT_MISMATCH",\n      deposit\n    };\n  }',
    'if (deposit.amount !== amount) {\n\n    deposit.status = "PENDING_REVIEW";\n    deposit.verificationResult = "AMOUNT_MISMATCH";\n    await deposit.save();\n\n    await DepositVerificationLog.create({\n      referenceId: deposit.referenceId,\n      userId: deposit.userId,\n      senderAccount,\n      receiverAccount,\n      requestedAmount: deposit.amount,\n      receivedAmount: amount,\n      channel,\n      verificationResult: "AMOUNT_MISMATCH",\n      rawPayload: payload\n    });\n\n    inspector.error("php-deposit", `Amount mismatch for ${deposit.referenceId}: requested ${deposit.amount}, received ${amount}`, {\n      orderId: deposit.referenceId,\n      userId: deposit.userId,\n      requestedAmount: deposit.amount,\n      receivedAmount: amount,\n      channel,\n      step: "verify-amount",\n    });\n\n    return {\n      matched: false,\n      code: "AMOUNT_MISMATCH",\n      deposit\n    };\n  }',
    "inspector.error on AMOUNT_MISMATCH",
    'inspector.error("php-deposit", `Amount mismatch for'
)

patch(DVS,
    'deposit.status = "CREDITED";\n  deposit.verificationResult = "MATCHED";\n  deposit.creditedAt = new Date();\n\n  await deposit.save();\n\n  return {\n    matched: true,\n    code: "MATCHED",\n    deposit\n  };\n}',
    'deposit.status = "CREDITED";\n  deposit.verificationResult = "MATCHED";\n  deposit.creditedAt = new Date();\n\n  await deposit.save();\n\n  inspector.success("php-deposit", `Auto-matched and credited ${amount} PHP for ${deposit.referenceId}`, {\n    orderId: deposit.referenceId,\n    userId: deposit.userId,\n    amount,\n    channel,\n    step: "credited",\n  });\n\n  return {\n    matched: true,\n    code: "MATCHED",\n    deposit\n  };\n}',
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
