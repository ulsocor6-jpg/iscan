#!/bin/bash
# Run from project root (with the server already running via `npm start` in another terminal):
#   bash smoke_test.sh > smoke_test_report.txt 2>&1
#
# Requires: curl, and optionally jq for prettier output (falls back if missing).

set -uo pipefail

BASE="http://localhost:3000/api/v1"
EMAIL="smoketest_$(date +%s)@example.com"
PASSWORD="TestPass123!"
COOKIES=$(mktemp)

have_jq() { command -v jq >/dev/null 2>&1; }

show() {
  if have_jq; then
    echo "$1" | jq . 2>/dev/null || echo "$1"
  else
    echo "$1"
  fi
}

req() {
  # req METHOD PATH [JSON_BODY]
  local method="$1" path="$2" body="${3:-}"
  echo ""
  echo "----- $method $path -----"
  if [ -n "$body" ]; then
    resp=$(curl -s -b "$COOKIES" -c "$COOKIES" -X "$method" "$BASE$path" \
      -H "Content-Type: application/json" -d "$body" -w "\n[HTTP %{http_code}]")
  else
    resp=$(curl -s -b "$COOKIES" -c "$COOKIES" -X "$method" "$BASE$path" -w "\n[HTTP %{http_code}]")
  fi
  echo "$resp"
}

echo "=== 0. Server reachable? ==="
curl -s -o /dev/null -w "GET / -> [HTTP %{http_code}]\n" http://localhost:3000/

echo ""
echo "=== 1. AUTH: register ==="
req POST /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Smoke\",\"lastName\":\"Test\"}"

echo ""
echo "=== 2. AUTH: login ==="
req POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

echo ""
echo "=== 3. AUTH: verify / me ==="
req GET /auth/verify
req GET /auth/me

echo ""
echo "=== 4. DASHBOARD ==="
req GET /dashboard

echo ""
echo "=== 5. WALLET ==="
req GET /wallet/balance
req GET /wallet

echo ""
echo "=== 6. LEDGER ==="
req GET /ledger/history

echo ""
echo "=== 7. TRANSACTIONS ==="
req GET /transactions
req GET "/transactions?limit=5"

echo ""
echo "=== 8. TRANSFER (GET, just checking route resolves - likely needs POST + body) ==="
req GET /transfer

echo ""
echo "=== 9. BANK ==="
req GET /bank/list

echo ""
echo "=== 10. BENEFICIARIES ==="
req GET /beneficiaries

echo ""
echo "=== 11. KYC ==="
req GET /kyc/status

echo ""
echo "=== 12. SWAP (GET, just checking route resolves) ==="
req GET /swap

echo ""
echo "=== 13. ONRAMP ==="
req GET /onramp/rate

echo ""
echo "=== 14. REMITTANCE (GET, checking route resolves) ==="
req GET /remittance

echo ""
echo "=== 15. P2P (GET, checking route resolves) ==="
req GET /p2p

echo ""
echo "=== 16. USERS search ==="
req GET "/users/search?q=sm"

echo ""
echo "=== 17. INTERNAL WALLETS ==="
req GET /internal-wallets

echo ""
echo "=== 18. WEBHOOKS (payment, expect 401 - no valid signature) ==="
req POST /webhooks/payment "{\"referenceId\":\"test\",\"status\":\"success\"}"

rm -f "$COOKIES"

echo ""
echo "=== DONE ==="
echo "Look for: connection errors (ECONNREFUSED), 500s with stack traces in the server console,"
echo "404s on routes that should exist, and any [STUB CALLED] warnings in the server log."
