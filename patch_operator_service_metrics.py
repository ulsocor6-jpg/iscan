#!/usr/bin/env python3
import sys
from pathlib import Path

path = Path("src/operator/operatorService.js")
text = path.read_text()

marker = "metrics:\n                node.metrics"
if marker in text:
    print("SKIP: already patched")
    sys.exit(0)

old = '''            error:
                node.error

        }));'''

new = '''            error:
                node.error,

            metrics:
                node.metrics

        }));'''

if text.count(old) != 1:
    print(f"ABORT: anchor not found exactly once ({text.count(old)} matches)")
    sys.exit(1)

path.write_text(text.replace(old, new))
print("OK: metrics now included in getWorkers()")
