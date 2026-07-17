#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Concern: USDC/USDT deposited to a user's general per-chain wallet address
(the one shown on the Dashboard / created by getOrCreateChainAddress) is
never detected or swept, so it never reaches internalUSDC and can never
be used to fund a swap -- even though it's visibly sitting on-chain.

Root cause, confirmed by comparing walletAddressService.js and
baseStableListener.js directly (not guessed):

  getOrCreateChainAddress() creates exactly ONE DepositAddress per user
  per chain, tagged token: "*" (wildcard -- "any token"), per its own
  code comment. This is the address used for the Wallet Portfolio /
  Dashboard balance display.

  baseStableListener.js queries:
      DepositAddress.find({ chain: "base", token: { $in: ["USDC","USDT"] }, ... })

  Mongo's $in does an exact match. "*" never matches "USDC" or "USDT",
  so the wildcard address created by getOrCreateChainAddress is silently
  excluded from every scan cycle. Any USDC/USDT sent there is real,
  on-chain, and permanently invisible to the sweep pipeline.

Fix: widen the query to also match wildcard-token addresses, consistent
with what the DepositAddress model itself documents "*" as meaning.

Run from ~/Desktop/iscansystem:
    python3 patch_basestablelistener_wildcard_token.py

Then review:
    git --no-pager diff -- src/services/blockchain/baseStableListener.js

Then commit and remove this script + the .bak file it created.

NOTE: this only fixes the Base USDC/USDT listener, since that's the one
you shared. If there's a Ronin equivalent, or any other listener that
filters DepositAddress by an exact token value (worth grepping for:
`token: { $in:` and `token: "FLOWER"` etc.), it likely has the same bug
and is a separate concern to check next.
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
    "src/services/blockchain/baseStableListener.js",
    [
        (
            """      const addresses = await DepositAddress.find({
        chain:  "base",
        token:  { $in: ["USDC", "USDT"] },
        status: "active"
      });""",
            """      // "*" is the wildcard token tag getOrCreateChainAddress() uses for
      // a user's single general per-chain address (see walletAddressService.js
      // and depositAddressModel.js) -- without it here, USDC/USDT sent to
      // that address is real on-chain balance that this listener never sees,
      // never sweeps, and never credits to internalUSDC.
      const addresses = await DepositAddress.find({
        chain:  "base",
        token:  { $in: ["USDC", "USDT", "*"] },
        status: "active"
      });""",
        ),
    ],
)

print("\nDone. Next steps:")
print("  git --no-pager diff -- src/services/blockchain/baseStableListener.js")
print("  # review, then commit")
print("  rm src/services/blockchain/baseStableListener.js.bak.%s patch_basestablelistener_wildcard_token.py" % STAMP)
