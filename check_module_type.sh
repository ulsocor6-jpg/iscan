#!/bin/bash
# Run from project root: bash check_module_type.sh > module_type_report.txt
set -e

echo "=== package.json (full) ==="
cat package.json

echo ""
echo "=== settlement files - module syntax check ==="
for f in src/services/settlement/index.js src/services/settlement/settlementQueue.js src/services/settlement/settlementWorker.js; do
  echo "--- $f ---"
  head -10 "$f" 2>/dev/null || echo "(not found)"
  echo ""
done

echo ""
echo "=== authMiddleware export style ==="
head -5 src/middleware/authMiddleware.js

echo ""
echo "=== .env keys present (names only, not values) ==="
if [ -f .env ]; then
  grep -oE '^[A-Z_][A-Z0-9_]*=' .env
else
  echo "(no .env found)"
fi
