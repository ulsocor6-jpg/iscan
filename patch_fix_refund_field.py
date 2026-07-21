#!/usr/bin/env python3
"""
Fix: previous patch's anchor for adding refundConfirmed/refundedAt to the
record included a trailing comment that isn't actually in the file.
Corrected anchor below, verified against the real file content.

Run from repo root:  python3 patch_fix_refund_field.py
"""
import sys
from pathlib import Path

SC = "src/controllers/supportController.js"
p = Path(SC)
text = p.read_text()

marker = "refundConfirmed: refundStatus?.confirmed ?? null,"
if marker in text:
    print("  skip: already patched")
    sys.exit(0)

old = '''      expiresAt: withdrawal.expiresAt || null,
      createdAt: withdrawal.createdAt,
      canRetry: !!canRetry && !isPhp,
      canCancel: !!canCancel,
    },'''

new = '''      expiresAt: withdrawal.expiresAt || null,
      createdAt: withdrawal.createdAt,
      refundConfirmed: refundStatus?.confirmed ?? null,
      refundedAt: refundStatus?.refundedAt ?? null,
      canRetry: !!canRetry && !isPhp,
      canCancel: !!canCancel,
    },'''

count = text.count(old)
if count == 0:
    print("ABORT: anchor still not found")
    print(repr(old))
    sys.exit(1)
if count > 1:
    print(f"ABORT: matched {count} times, expected 1")
    sys.exit(1)

p.write_text(text.replace(old, new))
print(f"OK: patched {SC}")
