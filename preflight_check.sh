#!/bin/bash
# Run from project root: bash preflight_check.sh > preflight_report.txt
set -e

ROUTES=(
  src/routes/authRoutes.js
  src/routes/walletRoutes.js
  src/routes/dashboardRoutes.js
  src/routes/ledgerRoutes.js
  src/routes/transactionRoutes.js
  src/routes/transferRoutes.js
  src/routes/bankRoutes.js
  src/routes/beneficiaryRoutes.js
  src/routes/kycRoutes.js
  src/routes/swapRoutes.js
  src/routes/CryptoOnramproutes.js
  src/routes/remittanceRoutes.js
  src/routes/p2pRoutes.js
  src/routes/userRoutes.js
  src/routes/internalWalletRoutes.js
  src/routes/webhookRoutes.js
)

echo "=== 1. 'router' used before declared (grep order check) ==="
for f in "${ROUTES[@]}"; do
  [ -f "$f" ] || { echo "$f : MISSING FILE"; continue; }
  decl_line=$(grep -n "const router = express.Router()" "$f" | head -1 | cut -d: -f1)
  first_use=$(grep -n "router\.\(get\|post\|put\|delete\|patch\|use\)" "$f" | head -1 | cut -d: -f1)
  if [ -n "$decl_line" ] && [ -n "$first_use" ] && [ "$first_use" -lt "$decl_line" ]; then
    echo "$f : router used at line $first_use BEFORE declared at line $decl_line"
  fi
done

echo ""
echo "=== 2. Every import target file exists? ==="
for f in "${ROUTES[@]}"; do
  [ -f "$f" ] || continue
  dir=$(dirname "$f")
  grep -oE "from ['\"][^'\"]+['\"]" "$f" | sed -E "s/from ['\"](.+)['\"]/\1/" | while read -r imp; do
    case "$imp" in
      .*)
        target=$(realpath -m "$dir/$imp" 2>/dev/null)
        if [ ! -f "$target" ]; then
          echo "$f -> MISSING: $imp  (resolved: $target)"
        fi
        ;;
    esac
  done
done

echo ""
echo "=== 3. Default vs named export mismatches for service/model imports ==="
for f in "${ROUTES[@]}"; do
  [ -f "$f" ] || continue
  dir=$(dirname "$f")
  # find default imports: import X from '...'
  grep -oE "^import [A-Za-z_][A-Za-z0-9_]* from ['\"][^'\"]+['\"]" "$f" | while read -r line; do
    name=$(echo "$line" | sed -E "s/^import ([A-Za-z_][A-Za-z0-9_]*) from.*/\1/")
    imp=$(echo "$line" | sed -E "s/.*from ['\"](.+)['\"]/\1/")
    case "$imp" in
      .*)
        target=$(realpath -m "$dir/$imp" 2>/dev/null)
        if [ -f "$target" ]; then
          if ! grep -qE "export default" "$target"; then
            echo "$f imports DEFAULT '$name' from $imp -- but $imp has NO 'export default' (only named exports)"
          fi
        fi
        ;;
    esac
  done
done

echo ""
echo "=== 4. Methods called on ledgerService / transactionService / walletService that may not exist ==="
echo "--- ledgerService.js exported members ---"
grep -oE "(async )?[a-zA-Z_]+\s*\(" src/services/ledgerService.js | sed 's/(//' | sed 's/async //'
echo ""
echo "--- transactionService.js exported members (class methods) ---"
grep -oE "^\s*(async )?[a-zA-Z_]+\s*\(" src/services/transactionService.js | sed -E 's/^\s*(async )?//' | sed 's/(//'
echo ""
echo "--- walletService.js exported members (class methods) ---"
grep -oE "^\s*(async )?[a-zA-Z_]+\s*\(" src/services/walletService.js | sed -E 's/^\s*(async )?//' | sed 's/(//'
echo ""
echo "--- calls to ledgerService.X / transactionService.X / walletService.X in route files ---"
grep -oE "(ledgerService|transactionService|walletService|LedgerService|WalletService|TransactionService)\.[a-zA-Z_]+" "${ROUTES[@]}" | sort -u

echo ""
echo "=== 5. integrations/coinsph.js and core/ledgerEngine.js export check (used by remittance/internalWallet routes) ==="
echo "--- src/integrations/coinsph.js exports ---"
grep -nE "export" src/integrations/coinsph.js 2>/dev/null || echo "(file missing or no exports)"
echo ""
echo "--- core/ledgerEngine.js exports ---"
grep -nE "export|module.exports" core/ledgerEngine.js 2>/dev/null || echo "(file missing or no exports)"

echo ""
echo "=== 6. p2pTransferService.js export check ==="
grep -nE "export" src/services/p2pTransferService.js 2>/dev/null || echo "(file missing or no exports)"

echo ""
echo "=== 7. beneficiaryRoutes.js full import block + beneficiaryController exports ==="
head -10 src/routes/beneficiaryRoutes.js
echo "--- beneficiaryController.js exports ---"
grep -nE "export" src/controllers/beneficiaryController.js 2>/dev/null || echo "(file missing)"

echo ""
echo "=== 8. transakProvider.js export check (webhookRoutes dependency) ==="
grep -nE "export" src/integrations/paymentProviders/transakProvider.js 2>/dev/null || echo "(file missing or no exports)"
