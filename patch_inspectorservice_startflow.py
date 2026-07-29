#!/usr/bin/env python3
"""
Patch: src/services/inspectorService.js

Problem:
  startFlow() destructures a fixed set of params (pipeline, source,
  transactionType, referenceId, amount, currency, sender, senderPhone,
  senderLastFour, rawNotification, parsedNotification) and ALWAYS
  generates its own flowId, ignoring any flowId the caller passes in.

  phpSettlementService.js calls startFlow({ flowId: txRef, ... }) so that
  Swap Inspector / reasoningEngine / rootCauseClassifier can key off the
  same txRef used elsewhere for this swap — but flowId is silently
  dropped, so every later startStage/finishStage/failStage(txRef, ...)
  call queries { flowId: txRef } against a document that was actually
  created with a different, auto-generated flowId. No match -> no
  upsert flag on those calls -> silent no-op -> "No stages recorded
  yet" / stalled pipeline in the Inspector UI, with no thrown error.

  Separately, the fixed param list hardcodes Maya/MariBank-only fields
  (sender, senderPhone, senderLastFour, rawNotification,
  parsedNotification) into a function every pipeline (deposits AND
  swaps) shares, even though swaps never use them.

Fix:
  - Accept an optional flowId and use it when provided, falling back
    to the auto-generated id when it's not.
  - Replace the hardcoded deposit-only fields with a rest param so
    each pipeline's payload determines what extra fields get stored,
    without the function needing to know about them by name. This is
    backward compatible: existing callers (maribankNotifyRoute.js,
    mayaNotifyRoute.js, directDepositRoutes.js,
    maribankEmailListener.js, processTransaction.js) keep passing
    sender/senderPhone/etc. exactly as before and nothing changes for
    them — those fields still land in Inspector via the schema fields
    already defined in inspectorModel.js.

Usage:
    python3 patch_inspectorservice_startflow.py [path_to_repo_root]

Defaults to current directory if no path given. Aborts loudly (no
partial writes) if the expected old code isn't found verbatim.
"""

import sys
from pathlib import Path

def main():
    repo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    target = repo_root / "src" / "services" / "inspectorService.js"

    if not target.exists():
        print(f"ABORT: file not found: {target}")
        sys.exit(1)

    original = target.read_text(encoding="utf-8")

    old = """    async startFlow({
        pipeline,
        source,
        transactionType,
        referenceId = null,
        amount = null,
        currency = null,
        sender = null,
        senderPhone = null,
        senderLastFour = null,
        rawNotification = null,
        parsedNotification = null
    }) {

        const flowId =
            "INS-" +
            Date.now() +
            "-" +
            crypto.randomBytes(3).toString("hex").toUpperCase();

        const flow = await Inspector.create({

            flowId,

            pipeline,

            source,

            transactionType,

            referenceId,

            amount,

            currency,

            sender,

            senderPhone,

            senderLastFour,

            rawNotification,

            parsedNotification,

            status: "RUNNING","""

    new = """    async startFlow({
        flowId = null,
        pipeline,
        source,
        transactionType,
        referenceId = null,
        amount = null,
        currency = null,
        ...rest
    }) {

        const finalFlowId =
            flowId ||
            "INS-" +
            Date.now() +
            "-" +
            crypto.randomBytes(3).toString("hex").toUpperCase();

        const flow = await Inspector.create({

            flowId: finalFlowId,

            pipeline,

            source,

            transactionType,

            referenceId,

            amount,

            currency,

            ...rest,

            status: "RUNNING","""

    count = original.count(old)
    if count == 0:
        print("ABORT: expected old startFlow() block not found verbatim in file.")
        print("File may have already been patched, or has diverged from what this script expects.")
        sys.exit(1)
    if count > 1:
        print(f"ABORT: old block matched {count} times — expected exactly 1. Refusing to guess.")
        sys.exit(1)

    patched = original.replace(old, new)

    backup = target.with_suffix(target.suffix + f".bak.patch_startflow")
    backup.write_text(original, encoding="utf-8")
    target.write_text(patched, encoding="utf-8")

    print(f"OK: patched {target}")
    print(f"Backup written to {backup}")
    print()
    print("Next steps:")
    print("  git --no-pager diff -- src/services/inspectorService.js")
    print("  node --check src/services/inspectorService.js")

if __name__ == "__main__":
    main()
