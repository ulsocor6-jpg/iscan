#!/usr/bin/env python3
"""
patch_swaps_direction_aware_balance.py

Corrects the previous chain-aware balance fix in src/pages/Swaps.tsx.

The two swap directions have genuinely different "available balance"
semantics, confirmed against the backend:

  - FLOWER -> USDC: user deposits FLOWER to a fresh per-chain address.
    "Available" should reflect the real on-chain balance on the SELECTED
    chain (onchain[flowerChain][token]).

  - USDC -> FLOWER: settleUsdtToFlower() debits straight from the internal
    Ledger via walletService.debit(userId, "USDC", amount, ...), which
    throws `Insufficient ${asset} balance. Available: ${current}` based on
    a flat ledger aggregate -- NOT scoped to any chain. `chain` here only
    picks which treasury executes the reverse swap, not which balance the
    user is allowed to spend from. So "available" for this direction
    should show the flat ledger balance (usdcBal), not a chain-scoped
    on-chain read -- otherwise it can show $0.00 for a chain with no
    on-chain USDC while the ledger (and the real submit check) has funds.

Run from repo root:
    python3 patch_swaps_direction_aware_balance.py

Safe to re-run -- skips if already applied.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
TARGET = "src/pages/Swaps.tsx"

def read(path):
    p = ROOT / path
    if not p.exists():
        print(f"[FAIL] {path} not found — run this from the repo root")
        return None
    return p.read_text()

def write(path, content):
    (ROOT / path).write_text(content)
    print(f"[OK] wrote {path}")

def main():
    content = read(TARGET)
    if content is None:
        sys.exit(1)

    # This is the line the previous patch (patch_swaps_chain_balance.py) wrote.
    old_frombal = (
        '          // Chain-aware: reads the per-chain balance already fetched into\n'
        '          // `onchain` state (same shape the backend validates against),\n'
        '          // instead of the flat cross-chain aggregate. Without this, the\n'
        '          // displayed "Available" balance never matched what a submit\n'
        '          // would actually check on the selected network.\n'
        '          const fromBal    = onchain?.[flowerChain]?.[isF2U ? "FLOWER" : "USDC"] ?? 0;'
    )

    new_frombal = (
        '          // FLOWER->USDC deposits real FLOWER on-chain, so "available" must\n'
        '          // match the selected chain\'s real balance (onchain[flowerChain]).\n'
        '          // USDC->FLOWER instead debits the flat internal Ledger via\n'
        '          // walletService.debit() (see "Insufficient ${asset} balance" in\n'
        '          // walletService.js) -- that check has no chain scoping at all, so\n'
        '          // showing a chain-scoped on-chain balance there would disagree with\n'
        '          // what a submit actually checks. `chain` only picks which treasury\n'
        '          // executes the reverse swap, not which balance funds it.\n'
        '          const fromBal    = isF2U\n'
        '            ? (onchain?.[flowerChain]?.FLOWER ?? 0)\n'
        '            : usdcBal;'
    )

    if new_frombal in content:
        print("[SKIP] direction-aware balance fix — already applied")
        return

    if old_frombal in content:
        content = content.replace(old_frombal, new_frombal, 1)
        write(TARGET, content)
        print("[OK] direction-aware balance fix applied (reverting incorrect chain-scoping for USDC->FLOWER)")
        return

    # Fallback: previous patch's line wasn't found verbatim (maybe applied
    # differently, or original unpatched line still present). Try the
    # original pre-patch line too, in case patch_swaps_chain_balance.py
    # was never run on this checkout.
    old_original = '          const fromBal    = isF2U ? flowerBal : usdcBal;'
    if old_original in content:
        content = content.replace(old_original, new_frombal, 1)
        write(TARGET, content)
        print("[OK] direction-aware balance fix applied directly (original line found)")
        return

    print("[FAIL] neither the patched nor original fromBal line was found — file has drifted further, check manually")
    sys.exit(1)

if __name__ == "__main__":
    main()
