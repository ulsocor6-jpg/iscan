#!/usr/bin/env python3
"""
Fix: lookupWithdrawal and cancelWithdrawal responses still hardcoded
`WD-${withdrawal._id}` instead of using withdrawal.referenceId when
present (needed for CO- / PHP cashout references to echo back correctly).
Confirmed via grep -n "reference:" that lines ~130 and ~187 never got
updated by the previous patch, while line ~254 (retry) did.

Run from repo root:  python3 patch_fix_reference_echo.py
"""
import sys
from pathlib import Path

SC = "src/controllers/supportController.js"
p = Path(SC)
text = p.read_text()

old = "reference: `WD-${withdrawal._id}`,"
new = "reference: withdrawal.referenceId || `WD-${withdrawal._id}`,"

count = text.count(old)
print(f"Found {count} occurrence(s) of the old unconditional format.")

if count == 0:
    print("Nothing to do — already fixed or text doesn't match.")
    sys.exit(0)

text = text.replace(old, new)
p.write_text(text)
print(f"OK: replaced all {count} occurrence(s) in {SC}")

print("\nVerify with: grep -n 'reference:' src/controllers/supportController.js")
print("All three lines should now read: reference: withdrawal.referenceId || `WD-${withdrawal._id}`,")
