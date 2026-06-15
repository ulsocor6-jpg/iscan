#!/bin/bash
# Run from project root: bash fix_webhook_and_stubs.sh
set -e

TS=$(date +%Y%m%d_%H%M%S)
BACKUP="./_backup_$TS"
mkdir -p "$BACKUP/src/routes" "$BACKUP/src/services"

cp -a src/routes/webhookRoutes.js "$BACKUP/src/routes/"
cp -a src/services/ledgerService.js "$BACKUP/src/services/"
cp -a src/services/transactionService.js "$BACKUP/src/services/"

# ─────────────────────────────────────────────────────────────────────────
echo "=== Rewriting src/routes/webhookRoutes.js (fix order + named import) ==="
cat > src/routes/webhookRoutes.js << 'EOF'
import express from 'express';
import crypto from 'crypto';

import transactionService from '../services/transactionService.js';
import { LedgerService } from '../services/ledgerService.js';
import transakProvider from '../integrations/paymentProviders/transakProvider.js';

const router = express.Router();

/**
 * VERIFY SIGNATURE (PROVIDER SECURITY LAYER)
 */
const verifySignature = (payload, signature, secret) => {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return hmac === signature;
};

/**
 * TRANSAK WEBHOOK
 */
router.post('/transak', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-transak-signature'];
    const payload = JSON.parse(req.body);

    // 1. SECURITY CHECK
    if (!transakProvider.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { eventType, data } = payload;
    const { partnerOrderId, status, cryptoAmount, transactionHash } = data;

    // 2. FIND TRANSACTION by referenceId
    const tx = await transactionService.findByReference(partnerOrderId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 3. UPDATE BASED ON STATUS
    if (eventType === 'ORDER_COMPLETED' && status === 'COMPLETED') {
      await transactionService.transitionTo(tx._id, 'ONRAMP_COMPLETED', {
        cryptoAmount,
        txHash: transactionHash,
      });

      // Credit crypto amount to internal ledger if needed
      await LedgerService.creditCrypto(tx.userId, cryptoAmount, transactionHash);
    }

    if (eventType === 'ORDER_FAILED') {
      await transactionService.transitionTo(tx._id, 'FAILED');
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[TRANSAK WEBHOOK ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * MAIN WEBHOOK ENTRY POINT
 * (used by Maya / Coins.ph / banks)
 */
router.post('/payment', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const secret = process.env.WEBHOOK_SECRET;

    const payload = req.body;

    // 1. SECURITY CHECK
    if (!verifySignature(payload, signature, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { referenceId, status } = payload;

    // 2. FIND TRANSACTION
    const tx = await transactionService.findByReference(referenceId);

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 3. UPDATE BASED ON STATUS
    if (status === 'success') {
      await transactionService.markSettled(tx._id);
    }

    if (status === 'failed') {
      await transactionService.markFailed(tx._id);
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
EOF
echo "  rewritten src/routes/webhookRoutes.js"

# ─────────────────────────────────────────────────────────────────────────
echo "=== Adding creditCrypto stub to src/services/ledgerService.js ==="
cat > src/services/ledgerService.js << 'EOF'
import Ledger from "../models/ledgerModel.js";

export const LedgerService = {
  async record(entry, session) {
    return await Ledger.create([entry], { session });
  },

  // ── STUB (added by fix_webhook_and_stubs.sh) ─────────────────────────────
  // TODO: implement real crypto-credit ledger entry creation.
  // Expected behaviour: create a ledger entry crediting `cryptoAmount` of
  // the relevant crypto asset to `userId`, referencing `txHash`.
  async creditCrypto(userId, cryptoAmount, txHash) {
    console.warn(
      `[LedgerService.creditCrypto] STUB CALLED - not implemented. ` +
      `userId=${userId} cryptoAmount=${cryptoAmount} txHash=${txHash}`
    );
    return null;
  },
};

export default LedgerService;
EOF
echo "  updated src/services/ledgerService.js (added creditCrypto stub + default export)"

# ─────────────────────────────────────────────────────────────────────────
echo "=== Adding findByReference / transitionTo / markSettled / markFailed stubs to transactionService.js ==="

# Append stub methods as instance methods just before the final "export default new TransactionService();"
python3 - << 'PYEOF'
import re

path = "src/services/transactionService.js"
with open(path) as f:
    content = f.read()

stub_methods = '''
  // ── STUBS (added by fix_webhook_and_stubs.sh) ────────────────────────────
  // TODO: implement real lookups/state transitions against Transaction model.

  async findByReference(referenceId) {
    console.warn(
      `[TransactionService.findByReference] STUB CALLED - not implemented. referenceId=${referenceId}`
    );
    return null;
  }

  async transitionTo(txId, newStatus, meta = {}) {
    console.warn(
      `[TransactionService.transitionTo] STUB CALLED - not implemented. txId=${txId} newStatus=${newStatus} meta=${JSON.stringify(meta)}`
    );
    return null;
  }

  async markSettled(txId) {
    console.warn(
      `[TransactionService.markSettled] STUB CALLED - not implemented. txId=${txId}`
    );
    return null;
  }

  async markFailed(txId) {
    console.warn(
      `[TransactionService.markFailed] STUB CALLED - not implemented. txId=${txId}`
    );
    return null;
  }
'''

# Insert before the final closing brace of the class, which is right before
# "export default new TransactionService();"
marker = "export default new TransactionService();"
idx = content.rfind(marker)
if idx == -1:
    raise SystemExit("Could not find export default marker in transactionService.js")

# Find the class's closing brace - it's the "}" on its own line right before the marker
before = content[:idx]
# Walk backwards to find the last standalone "}" line before the marker
lines = before.rstrip("\n").split("\n")
# find last line that is exactly "}"
for i in range(len(lines) - 1, -1, -1):
    if lines[i].strip() == "}":
        insert_at = i
        break
else:
    raise SystemExit("Could not find class closing brace")

lines = lines[:insert_at] + [stub_methods.rstrip("\n")] + lines[insert_at:]
new_before = "\n".join(lines) + "\n"

content = new_before + content[idx:]

with open(path, "w") as f:
    f.write(content)

print("  inserted stub methods into transactionService.js")
PYEOF

echo ""
echo "=== Done ==="
echo "Backups in: $BACKUP/"
echo "Now run: npm start"
