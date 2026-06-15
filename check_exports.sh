#!/bin/bash
# Run from project root: bash check_exports.sh > exports_report.txt
set -e

echo "=== ledgerService.js export ==="
cat src/services/ledgerService.js

echo ""
echo "=== walletService.js export (tail) ==="
tail -5 src/services/walletService.js

echo ""
echo "=== transactionService.js export (tail) ==="
tail -5 src/services/transactionService.js

echo ""
echo "=== How each route/service imports ledgerService / walletService / transactionService ==="
grep -rn "ledgerService\|walletService\|transactionService" --include='*.js' src/ \
  | grep -E "^.*:(import|.*require)" 

echo ""
echo "=== webhookRoutes.js full ==="
cat src/routes/webhookRoutes.js

echo ""
echo "=== beneficiaryRoutes.js, p2pRoutes.js, remittanceRoutes.js, internalWalletRoutes.js - import lines only ==="
for f in src/routes/beneficiaryRoutes.js src/routes/p2pRoutes.js src/routes/remittanceRoutes.js src/routes/internalWalletRoutes.js; do
  echo "--- $f ---"
  grep -nE "^import" "$f" 2>/dev/null || echo "(not found)"
done

echo ""
echo "=== settlementWorker.js imports (uses ledgerService/walletService/transactionService default) ==="
head -10 src/services/settlement/settlementWorker.js
