#!/usr/bin/env python3
"""
patch_swaps_chain_balance.py

Fixes two bugs in the FLOWER<->USDC panel of src/pages/Swaps.tsx:

  1. Header hardcoded "Swap FLOWER -> USDC" regardless of fuDirection.
  2. "Available" balance ignored the selected FLOWER Network (flowerChain)
     entirely -- it read a flat, chain-aggregated balances.USDC/FLOWER
     value instead of the already-fetched per-chain `onchain` state
     (onchain[flowerChain][token]), which is what the backend actually
     validates against on submit. This is why the displayed "Available"
     number never matched the real error the backend returned.

Run from repo root:
    python3 patch_swaps_chain_balance.py

Safe to re-run -- skips any step already applied.
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

    changed = False

    # ── Fix 1: hardcoded header ──────────────────────────────────────────
    old_header = '<h3 style={{margin:"0 0 4px"}}>Swap FLOWER 🌸 → USDC</h3>'
    new_header = '<h3 style={{margin:"0 0 4px"}}>Swap {fromLabel} → {toLabel}</h3>'
    if new_header in content:
        print("[SKIP] header fix — already applied")
    elif old_header not in content:
        print("[FAIL] header anchor not found — file may have drifted, check manually")
    else:
        content = content.replace(old_header, new_header, 1)
        print("[OK] header fix applied")
        changed = True

    # ── Fix 2: chain-aware available balance ────────────────────────────
    old_frombal = '          const fromBal    = isF2U ? flowerBal : usdcBal;'
    new_frombal = (
        '          // Chain-aware: reads the per-chain balance already fetched into\n'
        '          // `onchain` state (same shape the backend validates against),\n'
        '          // instead of the flat cross-chain aggregate. Without this, the\n'
        '          // displayed "Available" balance never matched what a submit\n'
        '          // would actually check on the selected network.\n'
        '          const fromBal    = onchain?.[flowerChain]?.[isF2U ? "FLOWER" : "USDC"] ?? 0;'
    )
    if new_frombal in content:
        print("[SKIP] chain-aware balance fix — already applied")
    elif old_frombal not in content:
        print("[FAIL] fromBal anchor not found — file may have drifted, check manually")
    else:
        content = content.replace(old_frombal, new_frombal, 1)
        print("[OK] chain-aware balance fix applied")
        changed = True

    if changed:
        write(TARGET, content)
    else:
        print("\nNothing to do.")

if __name__ == "__main__":
    main()
