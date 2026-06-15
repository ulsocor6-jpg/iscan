#!/bin/bash
# Run from project root: bash inspect_wiring.sh > wiring_report.txt
set -e

echo "=== app.js ==="
cat app.js 2>/dev/null || echo "(not found)"

echo ""
echo "=== server.js ==="
cat server.js 2>/dev/null || echo "(not found)"

echo ""
echo "=== src/App.tsx (frontend routes) ==="
cat src/App.tsx 2>/dev/null || echo "(not found)"

echo ""
echo "=== Export lines from candidate route files ==="
for f in \
  src/routes/walletRoutes.js \
  src/routes/CryptoOnramproutes.js \
  src/routes/ledgerRoutes.js \
  src/routes/transactionRoutes.js \
  src/routes/dashboardRoutes.js \
  src/routes/authRoutes.js \
  src/routes/kycRoutes.js \
  src/routes/swapRoutes.js \
  src/routes/bankRoutes.js \
  src/routes/transferRoutes.js \
  src/routes/userRoutes.js \
  src/routes/walletRoutes.js
do
  if [ -f "$f" ]; then
    echo "--- $f ---"
    head -20 "$f"
    echo "  ...module.exports/export default:"
    grep -nE "module\.exports|export default|export const router" "$f"
    echo ""
  fi
done

echo ""
echo "=== Controller files referenced by those routes (first import lines) ==="
for f in \
  src/controllers/walletController.js \
  src/controllers/cryptoOnrampController.js \
  src/controllers/ledgerController.js \
  src/controllers/dashboardController.js \
  src/controllers/authController.js \
  src/controllers/kycController.js \
  src/controllers/swapController.js
do
  if [ -f "$f" ]; then
    echo "--- $f ---"
    grep -nE "^import|^const.*require|module\.exports|export (const|function|default)" "$f" | head -15
    echo ""
  fi
done

echo ""
echo "=== package.json scripts + main ==="
grep -A5 '"scripts"' package.json
grep '"main"' package.json
