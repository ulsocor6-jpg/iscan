#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Concern: flowerStageHandlers.js writes to order.stage, but the FlowerOrder
schema field is order.currentStage (enum: DEPOSIT | SWEEP | SWAP | SETTLE).
Because Mongoose strict mode silently drops unknown top-level paths on
save(), every `order.stage = "..."` assignment in this file has been a
no-op the whole time -- no error, no write, just discarded. currentStage
has never actually been populated by any of these four handlers.

This patch:
  1. Renames order.stage -> order.currentStage in all four handlers.
  2. Rewrites the assigned values to match the real schema enum
     (DEPOSIT/SWEEP/SWAP/SETTLE) instead of the previous made-up values
     (SWAP_PENDING, SETTLE_PENDING, SETTLING, SETTLED), which would now
     fail enum validation on save() if left as-is.

     FLOWER_SWEEP        confirmed -> order now sits at the SWAP stage
     FLOWER_SWAP          confirmed -> order now sits at the SETTLE stage
     FLOWER_REVERSE_SWAP  confirmed -> order now sits at the SETTLE stage
     FLOWER_SETTLE        confirmed -> order is done; leave currentStage
                                        at SETTLE (terminal)

Run from ~/Desktop/iscansystem:
    python3 patch_currentstage_field_fix.py

Then review:
    git --no-pager diff

Then commit and remove this script + the .bak file it created.
"""

import sys
import time
from pathlib import Path

ROOT = Path(".").resolve()
STAMP = int(time.time())


def apply_patch(rel_path: str, replacements: list[tuple[str, str]]) -> None:
    path = ROOT / rel_path
    if not path.exists():
        print(f"[SKIP] {rel_path} not found at {path}")
        sys.exit(1)

    content = path.read_text(encoding="utf-8")
    original = content

    for i, (old, new) in enumerate(replacements, start=1):
        count = content.count(old)
        if count != 1:
            print(f"[FAIL] {rel_path}: replacement #{i} matched {count} times (expected 1).")
            print("---- snippet ----")
            print(old[:300])
            print("-----------------")
            sys.exit(1)
        content = content.replace(old, new, 1)

    backup = path.with_suffix(path.suffix + f".bak.{STAMP}")
    backup.write_text(original, encoding="utf-8")
    path.write_text(content, encoding="utf-8")
    print(f"[OK] {rel_path} patched ({len(replacements)} edits). Backup: {backup.name}")


apply_patch(
    "src/services/blockchain/workers/flowerStageHandlers.js",
    [
        (
            """    order.sweep = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.stage = "SWAP_PENDING";
    await order.save();""",
            """    order.sweep = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.currentStage = "SWAP";
    await order.save();""",
        ),
        (
            """    order.swap = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.stage = "SETTLE_PENDING";
    await order.save();""",
            """    order.swap = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.currentStage = "SETTLE";
    await order.save();""",
        ),
        (
            """    // finalizeReverseSwapSuccess() in flowerUsdtSwapService.js separately
    // flips order.status -> COMPLETED once the FLOWER credit + FeeRecord
    // land. Only touch stage here, never status.
    order.stage = "SETTLING";
    await order.save();""",
            """    // finalizeReverseSwapSuccess() in flowerUsdtSwapService.js separately
    // flips order.status -> COMPLETED once the FLOWER credit + FeeRecord
    // land. Only touch currentStage here, never status.
    order.currentStage = "SETTLE";
    await order.save();""",
        ),
        (
            """    order.settle = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.stage = "SETTLED";
    order.status = "COMPLETED";
    await order.save();""",
            """    order.settle = {
      status: "CONFIRMED",
      txHash: job.txHash,
      actualAmount: pending.actualAmount,
      confirmedAt: new Date(),
    };
    order.currentStage = "SETTLE";
    order.status = "COMPLETED";
    await order.save();""",
        ),
    ],
)

print("\nDone. Next steps:")
print("  git --no-pager diff")
print("  # review, then commit")
print("  rm src/services/blockchain/workers/flowerStageHandlers.js.bak.%s patch_currentstage_field_fix.py" % STAMP)
