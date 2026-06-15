#!/bin/bash
# Run from project root: bash fix_register_bugs.sh
set -e

TS=$(date +%Y%m%d_%H%M%S)
BACKUP="./_backup_$TS"
mkdir -p "$BACKUP/src/services" "$BACKUP/src/controllers"

cp -a src/services/walletService.js "$BACKUP/src/services/"
cp -a src/controllers/authController.js "$BACKUP/src/controllers/"

# ─────────────────────────────────────────────────────────────────────────
echo "=== Fixing src/services/walletService.js: new Map({...}) -> new Map([[...]]) ==="
python3 - << 'PYEOF'
import re

path = "src/services/walletService.js"
with open(path) as f:
    content = f.read()

old = """new Map({
        USDT: 0,
        USDC: 0,
        ETH: 0,
        PHP: 0
      })"""

new = """new Map([
        ['USDT', 0],
        ['USDC', 0],
        ['ETH', 0],
        ['PHP', 0]
      ])"""

if old not in content:
    raise SystemExit("Pattern not found in walletService.js - aborting to avoid silent no-op")

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("  fixed Map constructor in walletService.js")
PYEOF

# ─────────────────────────────────────────────────────────────────────────
echo "=== Fixing src/controllers/authController.js: wallet.address/chain -> wallet.iscanAddress ==="
python3 - << 'PYEOF'
import re

path = "src/controllers/authController.js"
with open(path) as f:
    content = f.read()

old = """      wallet: {
        id: wallet._id,
        address: wallet.address,
        chain: wallet.chain
      }"""

new = """      wallet: {
        id: wallet._id,
        address: wallet.iscanAddress
      }"""

if old not in content:
    raise SystemExit("Pattern not found in authController.js - aborting to avoid silent no-op")

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("  fixed wallet field references in authController.js")
PYEOF

echo ""
echo "=== Done ==="
echo "Backups in: $BACKUP/"
echo "Restart the server (Ctrl+C then npm start 2>&1 | tee server.log) and re-run debug_register.sh"
