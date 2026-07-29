#!/usr/bin/env python3
"""
Patch: src/services/swap/phpSettlementService.js

Problem:
  settleStablecoinToPHP() (Crypto -> PHP direction) gates the swap on:

      if (stablePool.balance < stablecoinAmount)
          throw new Error(`Insufficient ${currency} in pool`);

  This checks whether treasury ALREADY holds at least as much stablecoin
  as the user is about to deposit. But in this direction the user's
  stablecoin is what's INCOMING — it gets swept into treasury later in
  this same function (the SWEEP / SWEEP_CONFIRM stages), and
  stablePool.balance is only credited with += stablecoinAmount AFTER
  that sweep confirms. Requiring the pool to already hold that balance
  before the sweep happens is backwards: it blocks legitimate swaps
  whenever on-chain treasury stablecoin happens to be low, which has
  nothing to do with whether THIS swap (which itself deposits stablecoin
  into treasury) can succeed.

  The only balance that legitimately gates this direction is PHP
  liquidity (can treasury pay the user out) — already checked correctly
  by phpPool.canFulfill(phpOut) directly above this block.

Fix:
  Remove the stablePool pre-balance check entirely. stablePool itself
  (the `getPool(currency)` fetch) is NOT removed — it's still used
  later in the function to credit stablePool.balance /
  stablePool.totalSwappedIn once the sweep is confirmed.

Usage:
    python3 patch_phpsettlement_remove_stablepool_gate.py [path_to_repo_root]

Defaults to current directory if no path given. Aborts loudly (no
partial writes) if the expected old code isn't found verbatim.
"""

import sys
from pathlib import Path

def main():
    repo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    target = repo_root / "src" / "services" / "swap" / "phpSettlementService.js"

    if not target.exists():
        print(f"ABORT: file not found: {target}")
        sys.exit(1)

    original = target.read_text(encoding="utf-8")

    old = """  if (!phpPool.canFulfill(phpOut))
    throw new Error(`Insufficient PHP liquidity. Available: \u20b1${phpPool.available.toFixed(2)}`);

  if (stablePool.balance < stablecoinAmount)
    throw new Error(`Insufficient ${currency} in pool`);

  // Lock PHP reserve"""

    new = """  if (!phpPool.canFulfill(phpOut))
    throw new Error(`Insufficient PHP liquidity. Available: \u20b1${phpPool.available.toFixed(2)}`);

  // NOTE: no stablePool.balance pre-check here on purpose. In this
  // direction (Crypto -> PHP) the user's stablecoin is INCOMING — it
  // gets swept into treasury later in this function (SWEEP /
  // SWEEP_CONFIRM), and stablePool.balance is only credited with
  // += stablecoinAmount after that sweep confirms. Requiring the pool
  // to already hold that balance before the sweep happens blocked
  // legitimate swaps whenever on-chain treasury stablecoin was
  // temporarily low, unrelated to this swap's own ability to succeed.
  // The only balance that legitimately gates this direction is PHP
  // liquidity, checked above via phpPool.canFulfill(phpOut).

  // Lock PHP reserve"""

    count = original.count(old)
    if count == 0:
        print("ABORT: expected old block not found verbatim in file.")
        print("File may have already been patched, or has diverged from what this script expects.")
        sys.exit(1)
    if count > 1:
        print(f"ABORT: old block matched {count} times — expected exactly 1. Refusing to guess.")
        sys.exit(1)

    patched = original.replace(old, new)

    backup = target.with_suffix(target.suffix + ".bak.patch_remove_stablepool_gate")
    backup.write_text(original, encoding="utf-8")
    target.write_text(patched, encoding="utf-8")

    print(f"OK: patched {target}")
    print(f"Backup written to {backup}")
    print()
    print("Next steps:")
    print("  git --no-pager diff -- src/services/swap/phpSettlementService.js")
    print("  node --check src/services/swap/phpSettlementService.js")

if __name__ == "__main__":
    main()
