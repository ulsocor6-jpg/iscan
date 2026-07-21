#!/usr/bin/env python3
"""
Patch: fix incidentEngine.js createKey() — it was still reading
event.source/event.orderId (which never existed on the raw inspector
event) instead of event.stage/event.metadata?.orderId. This caused every
incident with the same diagnosis code to collapse into a single shared
key regardless of which order/user it belonged to.

Run from repo root:  python3 patch_fix_incident_createkey.py
"""
import sys
from pathlib import Path

def patch(path, old, new, label, already_marker):
    p = Path(path)
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


IE = "src/services/operator/incidentEngine.js"

patch(IE,
    '''  createKey(event, diagnosis) {
    return [
      event.source,
      event.orderId,
      diagnosis.code
    ].join(":");
  }''',
    '''  createKey(event, diagnosis) {
    // Raw inspector events only ever have {stage, metadata, ...} — never
    // top-level source/orderId. Using those (as this did before) meant
    // every incident with the same code collapsed into one shared key
    // regardless of which order/user it actually belonged to.
    return [
      event.stage,
      event.metadata?.orderId,
      diagnosis.code
    ].join(":");
  }''',
    "fix createKey to dedupe by stage+orderId+code instead of undefined fields",
    "Raw inspector events only ever have"
)

print("\nDone. Existing open incidents from before this fix keep their old")
print("(broken) keys until resolved — only new ones get correctly-scoped keys.")
print("Next: node --check, restart server, re-trigger a test failure to confirm.")
