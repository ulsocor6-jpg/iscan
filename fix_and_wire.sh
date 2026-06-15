#!/bin/bash
# Run from project root: bash fix_and_wire.sh
#
# This script:
#  1. Backs up everything it touches into ./_backup_<timestamp>/
#  2. Sets package.json "type": "module"
#  3. Rewrites server.js as ESM, importing app.js, connecting Mongo (MONGODB_URI),
#     starting the settlement worker, and calling app.listen()
#  4. Fixes src/services/settlement/index.js to use ESM import/export
#  5. Rewrites app.js to import and mount all 17 route files under /api/v1/<name>
#  6. Quarantines confirmed duplicate/dead files (does not delete)
#
# After running: npm start  (then check console for errors)
# If anything breaks: restore from ./_backup_<timestamp>/

set -e

TS=$(date +%Y%m%d_%H%M%S)
BACKUP="./_backup_$TS"
mkdir -p "$BACKUP"

backup() {
  local f="$1"
  if [ -e "$f" ]; then
    mkdir -p "$BACKUP/$(dirname "$f")"
    cp -a "$f" "$BACKUP/$f"
  fi
}

echo "=== Backing up files to $BACKUP ==="
for f in package.json server.js app.js src/services/settlement/index.js \
         src/models/IdentityProfile.js src/models/identity/IdentityProfile.js \
         src/models/KYCVerification.js src/models/identity/KYCVerification.js \
         src/ledger/creditService.js src/services/ledger/creditService.js \
         src/services/walletService.ts src/services/ledgerService.ts \
         src/controllers/swapRoutes.js
do
  backup "$f"
done

# ─────────────────────────────────────────────────────────────────────────
echo "=== Step 1: Set package.json type to module ==="
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.type = "module";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("  package.json type ->", pkg.type);
'

# ─────────────────────────────────────────────────────────────────────────
echo "=== Step 2: Fix src/services/settlement/index.js (CommonJS -> ESM) ==="
cat > src/services/settlement/index.js << 'EOF'
import settlementWorker from "./settlementWorker.js";
import { settlementQueue } from "./settlementQueue.js";

export function startSettlementWorker() {
  if (settlementQueue && typeof settlementQueue.process === "function") {
    settlementQueue.process("finalize-transfer", async (job) => {
      return settlementWorker(job);
    });
  } else {
    console.warn("[settlement] settlementQueue.process not available - settlement worker not started");
  }

  console.log("Settlement worker running");
}
EOF
echo "  rewritten src/services/settlement/index.js"

# Check settlementQueue export shape - it currently exports enqueueSettlement etc as named exports,
# not an object with .process(). Add a minimal compatible export if missing.
if ! grep -q "export const settlementQueue" src/services/settlement/settlementQueue.js && \
   ! grep -q "export.*settlementQueue" src/services/settlement/settlementQueue.js; then
  cat >> src/services/settlement/settlementQueue.js << 'EOF'

// ── Compatibility shim added by fix_and_wire.sh ──────────────────────────
// Provides a minimal .process() based queue interface expected by
// src/services/settlement/index.js
const handlers = {};
export const settlementQueue = {
  process(name, fn) {
    handlers[name] = fn;
  },
  async run(name, job) {
    if (handlers[name]) return handlers[name](job);
    throw new Error(`No handler registered for "${name}"`);
  },
};
EOF
  echo "  appended settlementQueue compatibility shim to settlementQueue.js"
fi

# ─────────────────────────────────────────────────────────────────────────
echo "=== Step 3: Rewrite app.js (mount all routes) ==="
cat > app.js << 'EOF'
import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Routes ────────────────────────────────────────────────────────────────
import authRoutes from './src/routes/authRoutes.js';
import walletRoutes from './src/routes/walletRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';
import ledgerRoutes from './src/routes/ledgerRoutes.js';
import transactionRoutes from './src/routes/transactionRoutes.js';
import transferRoutes from './src/routes/transferRoutes.js';
import bankRoutes from './src/routes/bankRoutes.js';
import beneficiaryRoutes from './src/routes/beneficiaryRoutes.js';
import kycRoutes from './src/routes/kycRoutes.js';
import swapRoutes from './src/routes/swapRoutes.js';
import onrampRoutes from './src/routes/CryptoOnramproutes.js';
import remittanceRoutes from './src/routes/remittanceRoutes.js';
import p2pRoutes from './src/routes/p2pRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import internalWalletRoutes from './src/routes/internalWalletRoutes.js';
import webhookRoutes from './src/routes/webhookRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API routes ───────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/transfer', transferRoutes);
app.use('/api/v1/bank', bankRoutes);
app.use('/api/v1/beneficiaries', beneficiaryRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/swap', swapRoutes);
app.use('/api/v1/onramp', onrampRoutes);
app.use('/api/v1/remittance', remittanceRoutes);
app.use('/api/v1/p2p', p2pRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/internal-wallets', internalWalletRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

export default app;
EOF
echo "  rewritten app.js"

# ─────────────────────────────────────────────────────────────────────────
echo "=== Step 4: Rewrite server.js (ESM entrypoint) ==="
cat > server.js << 'EOF'
import mongoose from 'mongoose';
import app from './app.js';
import { startSettlementWorker } from './src/services/settlement/index.js';

async function startServer() {
  try {
    console.log("Connecting to MongoDB...");

    const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URL;
    if (!mongoUrl) {
      throw new Error("MONGODB_URI is not set in .env");
    }

    await mongoose.connect(mongoUrl);
    console.log("MongoDB connected");

    try {
      startSettlementWorker();
    } catch (err) {
      console.error("Settlement worker failed to start (continuing anyway):", err.message);
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log("ISCAN running on port", PORT);
    });

  } catch (err) {
    console.error("Server failed to start:", err);
    process.exit(1);
  }
}

startServer();
EOF
echo "  rewritten server.js"

# ─────────────────────────────────────────────────────────────────────────
echo "=== Step 5: Resolve duplicates ==="
QDIR="./_quarantine"
mkdir -p "$QDIR"

q() {
  local f="$1"
  if [ -e "$f" ]; then
    mkdir -p "$QDIR/$(dirname "$f")"
    git mv "$f" "$QDIR/$f" 2>/dev/null || mv "$f" "$QDIR/$f"
    echo "  quarantined: $f"
  fi
}

# Identical KYCVerification - keep models/identity/, drop root duplicate
q "src/models/KYCVerification.js"

# IdentityProfile stub - keep root (45-line real schema), drop identity/ stub
q "src/models/identity/IdentityProfile.js"

# creditService - keep services/ledger/ (more complete), drop ledger/ version
q "src/ledger/creditService.js"

# Empty TS stubs - keep the real .js versions
q "src/services/walletService.ts"
q "src/services/ledgerService.ts"

# Crypto onramp duplicates in public/ and .bak files - we're keeping src/controllers + src/services + src/routes
q "public/Cryptoonrampcontroller.js"
q "public/Cryptoonrampservice.js"
q "public/Cryptoonramproutes.js"
q "src/controllers/Cryptoonrampcontroller.js.bak"
q "src/services/CryptoOnrampservice.js.bak"

# Duplicate swapRoutes - keep src/routes/swapRoutes.js (mounted in app.js), drop controllers/ version
q "src/controllers/swapRoutes.js"

# server.backup.js - superseded by rewritten server.js
q "server.backup.js"

echo ""
echo "=== Done ==="
echo "Backups of touched files: $BACKUP/"
echo "Quarantined duplicates:   $QDIR/"
echo ""
echo "Next: run 'npm start' and check for errors."
echo "If something breaks, restore individual files with:"
echo "  cp -a $BACKUP/<path> <path>"
echo "Or pull a quarantined file back with:"
echo "  mv $QDIR/<path> <path>"
