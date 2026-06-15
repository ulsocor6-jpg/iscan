#!/bin/bash
# Run from project root: bash diff_duplicates.sh > duplicates_report.txt
set -e

pairs=(
  "./src/models/KYCVerification.js|./src/models/identity/KYCVerification.js"
  "./src/models/IdentityProfile.js|./src/models/identity/IdentityProfile.js"
  "./src/ledger/creditService.js|./src/services/ledger/creditService.js"
  "./src/controllers/Cryptoonrampcontroller.js.bak|./src/controllers/cryptoOnrampController.js"
  "./src/services/cryptoOnrampService.js|./src/services/CryptoOnrampservice.js.bak"
  "./src/controllers/swapRoutes.js|./src/routes/swapRoutes.js"
  "./public/Cryptoonrampcontroller.js|./src/controllers/cryptoOnrampController.js"
  "./public/Cryptoonrampservice.js|./src/services/cryptoOnrampService.js"
  "./public/Cryptoonramproutes.js|./src/routes/CryptoOnramproutes.js"
  "./src/services/walletService.js|./src/services/walletService.ts"
  "./src/services/ledgerService.js|./src/services/ledgerService.ts"
)

for pair in "${pairs[@]}"; do
  a="${pair%%|*}"
  b="${pair##*|}"
  echo "=== $a  vs  $b ==="
  if [ ! -f "$a" ]; then echo "  (missing: $a)"; fi
  if [ ! -f "$b" ]; then echo "  (missing: $b)"; fi
  if [ -f "$a" ] && [ -f "$b" ]; then
    if diff -q "$a" "$b" > /dev/null 2>&1; then
      echo "  IDENTICAL"
    else
      echo "  DIFFERENT - line counts: $(wc -l < "$a") vs $(wc -l < "$b")"
      echo "  diff summary (first 30 lines):"
      diff "$a" "$b" | head -30 | sed 's/^/    /'
    fi
  fi
  echo ""
done
