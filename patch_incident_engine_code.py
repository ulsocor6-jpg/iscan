#!/usr/bin/env python3
import sys
from pathlib import Path

path = Path("src/services/operator/incidentEngine.js")
text = path.read_text()

marker = "code: diagnosis.code,"
if marker in text:
    print("SKIP: already patched")
    sys.exit(0)

old = '''      diagnosis: diagnosis.title,
      recommendation: diagnosis.recommendation,'''
new = '''      code: diagnosis.code,
      diagnosis: diagnosis.title,
      recommendation: diagnosis.recommendation,'''

if text.count(old) != 1:
    print(f"ABORT: anchor not found exactly once ({text.count(old)} matches)")
    sys.exit(1)

path.write_text(text.replace(old, new))
print("OK: incident.code now set")
