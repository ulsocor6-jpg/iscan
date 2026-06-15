#!/bin/bash
# Run from project root: bash show_register.sh > register_code.txt
set -e

echo "=== authController.js: register function ==="
awk '/^export const register/,/^export const verifyEmail/' src/controllers/authController.js | head -100

echo ""
echo "=== userModel.js (full) ==="
cat src/models/userModel.js

echo ""
echo "=== walletService.js getOrCreateWallet (used by register?) ==="
grep -A20 "getOrCreateWallet" src/services/walletService.js | head -30

echo ""
echo "=== emailService.js exports (in case register sends verification email) ==="
grep -nE "export|module.exports" src/services/emailService.js 2>/dev/null || echo "(file missing)"

echo ""
echo "=== .env relevant keys check (existence, not values) - mongoose connection, jwt, email ==="
grep -oE '^[A-Z_][A-Z0-9_]*' .env
