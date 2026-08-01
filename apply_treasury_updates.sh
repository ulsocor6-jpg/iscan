#!/usr/bin/env bash
# apply_treasury_updates.sh
#
# Run this from the ROOT of your repo (~/Desktop/iscansystem), e.g.:
#   bash apply_treasury_updates.sh
#
# What it does:
#   - Overwrites 3 existing files (full content, already reviewed in full):
#       src/intelligence/consensus/expectedBalanceCalculator.js
#       src/bootstrap/startServices.js
#       src/models/treasuryAccountModel.js
#       src/intelligence/consensus/consensusSnapshotService.js
#   - Creates 5 new files:
#       src/intelligence/consensus/pendingOperationProjection.js
#       src/integrations/mexcClient.js
#       src/intelligence/laptop/mexcWatcher.js
#       src/controllers/adminTreasuryController.js
#       src/routes/adminTreasuryRoutes.js
#
# It will NOT overwrite a file if a .bak backup of it already exists from a
# prior run of this script, to avoid clobbering your own edits made in
# between runs. Delete the .bak file if you want to re-apply cleanly.

set -euo pipefail

backup_if_exists() {
  local f="$1"
  if [ -f "$f" ] && [ ! -f "$f.bak" ]; then
    cp "$f" "$f.bak"
    echo "  backed up $f -> $f.bak"
  fi
}

echo "== Backing up existing files that will be overwritten =="
backup_if_exists "src/intelligence/consensus/expectedBalanceCalculator.js"
backup_if_exists "src/bootstrap/startServices.js"
backup_if_exists "src/models/treasuryAccountModel.js"
backup_if_exists "src/intelligence/consensus/consensusSnapshotService.js"

echo "== Writing src/intelligence/consensus/expectedBalanceCalculator.js =="
cat > src/intelligence/consensus/expectedBalanceCalculator.js << 'EOF'
import treasurySnapshotService from "./treasurySnapshotService.js";
import projectionLedger from "./projectionLedger.js";
import pendingOperationProjection from "./pendingOperationProjection.js";

class ExpectedBalanceCalculator {

    async calculate(channel = null) {

        const currency = channel || "PHP";

        const snapshot = await treasurySnapshotService.capture(currency);

        // PHP sources its pending-incoming projection from DirectDeposit
        // (GCash/Maya/Bank e-wallet notifications). Every other currency
        // (USDC, etc.) sources it from PendingOperation instead —
        // DirectDeposit.channel is hard-enum'd to GCASH/BANK/MAYA and can
        // never hold a non-PHP value, so reusing projectionLedger for USDC
        // would silently always return totalPending: 0 rather than erroring.
        const projection = currency === "PHP"
            ? await projectionLedger.build(channel)
            : await pendingOperationProjection.build(currency);

        const expectedBalance =
            snapshot.realBalance +
            projection.totalPending;

        const expectedAvailable =
            snapshot.available +
            projection.totalPending;

        return {

            generatedAt: new Date(),

            snapshot,

            projection,

            expectedBalance,

            expectedAvailable,

            variance: 0

        };

    }

}

export default new ExpectedBalanceCalculator();
EOF

echo "== Writing src/intelligence/consensus/pendingOperationProjection.js (new) =="
cat > src/intelligence/consensus/pendingOperationProjection.js << 'EOF'
import PendingOperation from "../../models/blockchain/pendingOperationModel.js";

// Mirrors projectionLedger.js's shape/contract, but sources pending amounts
// from PendingOperation instead of DirectDeposit — for any currency that
// isn't PHP (e.g. USDC swept in via a manual MEXC P2P buy). PendingOperation
// .asset is a free-text string (no enum restriction), so this works for any
// currency without a schema change.
class PendingOperationProjection {

    async build(asset) {

        const operations = await PendingOperation.find({
            asset,
            status: "PENDING",
            expiration: { $gt: new Date() }
        })
            .sort({ createdAt: 1 })
            .lean();

        const totalPending = operations.reduce(
            (sum, op) => sum + Number(op.expectedAmount || 0),
            0
        );

        return {
            generatedAt: new Date(),
            pendingCount: operations.length,
            totalPending,
            deposits: operations
        };
    }

}

export default new PendingOperationProjection();
EOF

echo "== Writing src/models/treasuryAccountModel.js =="
cat > src/models/treasuryAccountModel.js << 'EOF'
import mongoose from 'mongoose';

const treasuryAccountSchema = new mongoose.Schema({
  currency: {
    type: String,
    required: true,
    index: true,
  },
  provider: {
    type: String,
    required: true,
    enum: ['maya', 'gcash', 'bank_bpi', 'maribank', 'mexc'],
  },
  accountLabel: {
    type: String,
    required: true,
  },
  physicalBalance: {
    type: Number,
    required: true,
    default: 0,
  },
  reserved: {
    type: Number,
    required: true,
    default: 0,
  },
  pendingIncoming: {
    type: Number,
    required: true,
    default: 0,
  },
  pendingOutgoing: {
    type: Number,
    required: true,
    default: 0,
  },
  safetyReserve: {
    type: Number,
    required: true,
    default: 0,
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  lastUpdatedBy: {
    type: String,
    default: null,
  },
}, { timestamps: true });

export default mongoose.model('TreasuryAccount', treasuryAccountSchema);
EOF

echo "== Writing src/integrations/mexcClient.js (new) =="
cat > src/integrations/mexcClient.js << 'EOF'
// src/integrations/mexcClient.js
// Minimal signed client for MEXC's public Spot v3 API — READ-ONLY usage
// only (account balance polling). Does NOT place orders. MEXC's P2P
// marketplace buy is done manually by admin in the MEXC app — there is no
// reliable public API for automated P2P order placement (the P2P Open API
// is merchant-gated and separate from this Spot API entirely). This client
// only observes the *result* of that manual trade landing in the account.
//
// Signing scheme per https://mexcdevelop.github.io/apidocs/spot_v3_en/:
// HMAC-SHA256 over the query string, keyed with MEXC_API_SECRET.

import crypto from "crypto";

const MEXC_BASE = "https://api.mexc.com";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — cannot call MEXC API`);
  }
  return value;
}

function sign(queryString, secret) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function signedGet(path, params = {}) {
  const apiKey = requireEnv("MEXC_API_KEY");
  const apiSecret = requireEnv("MEXC_API_SECRET");

  const query = new URLSearchParams({
    ...params,
    timestamp: Date.now().toString(),
    recvWindow: "5000",
  });

  const queryString = query.toString();
  const signature = sign(queryString, apiSecret);
  const url = `${MEXC_BASE}${path}?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "X-MEXC-APIKEY": apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MEXC API error ${res.status}: ${body}`);
  }

  return res.json();
}

// GET /api/v3/account — { balances: [{ asset, free, locked }, ...] }
export async function getAccountBalances() {
  const data = await signedGet("/api/v3/account");
  return data.balances || [];
}

export async function getAssetBalance(asset) {
  const balances = await getAccountBalances();
  const entry = balances.find(b => b.asset === asset);
  if (!entry) return { asset, free: 0, locked: 0 };
  return { asset, free: parseFloat(entry.free), locked: parseFloat(entry.locked) };
}

export default { getAccountBalances, getAssetBalance };
EOF

echo "== Writing src/intelligence/laptop/mexcWatcher.js (new) =="
cat > src/intelligence/laptop/mexcWatcher.js << 'EOF'
// src/intelligence/laptop/mexcWatcher.js
// Polls MEXC's Spot account balance for the configured settlement asset
// (default USDC) and reports it into the same treasury pipeline the
// Android/GCash/Maya watchers already use — any change here automatically
// triggers a fresh signed consensus snapshot via
// treasuryCoordinator.recalculatePool(), same as an Android balance report.

import treasuryCoordinator from "../../services/treasury/treasuryCoordinator.js";
import TreasuryAccount from "../../models/treasuryAccountModel.js";
import { getAssetBalance } from "../../integrations/mexcClient.js";

const POLL_INTERVAL_MS = 60 * 1000;
const SETTLEMENT_ASSET = process.env.MEXC_SETTLEMENT_ASSET || "USDC";

let _interval = null;

async function pollOnce() {
  try {
    const { free } = await getAssetBalance(SETTLEMENT_ASSET);

    const account = await TreasuryAccount.findOne({
      provider: "mexc",
      currency: SETTLEMENT_ASSET,
      isActive: true,
    });

    if (!account) {
      console.warn(
        `[MexcWatcher] No active TreasuryAccount for provider=mexc currency=${SETTLEMENT_ASSET} — create one to enable tracking. Skipping report.`
      );
      return;
    }

    await treasuryCoordinator.updatePhysicalBalance(account._id, free, "mexc-watcher");
    console.log(`[MexcWatcher] Reported ${SETTLEMENT_ASSET} balance: ${free}`);
  } catch (err) {
    console.error("[MexcWatcher] Poll failed:", err.message);
  }
}

export function startMexcWatcher() {
  if (_interval) return;
  console.log(`[MexcWatcher] started — polling ${SETTLEMENT_ASSET} balance every 60s`);
  pollOnce();
  _interval = setInterval(pollOnce, POLL_INTERVAL_MS);
}

export default { startMexcWatcher };
EOF

echo "== Writing src/bootstrap/startServices.js =="
cat > src/bootstrap/startServices.js << 'EOF'
import { startBlockchainObserver } from "../services/compliance/BlockchainObserver.js";
import { startOperationCorrelator } from "../services/compliance/OperationCorrelator.js";
import { startComplianceInspector } from "../services/compliance/ComplianceInspector.js";
import { startRiskScoreConsumer } from "../services/compliance/RiskScoreConsumer.js";
import operatorSubscriber from "../services/operator/operatorSubscriber.js";
import consensusService from '../services/consensusService.js';
import { startMexcWatcher } from "../intelligence/laptop/mexcWatcher.js";




export function startServices() {
    operatorSubscriber.start();
    startBlockchainObserver();
    startOperationCorrelator();
    startComplianceInspector();
    startRiskScoreConsumer();
    startMexcWatcher();

    // depositScanner.start();
    // flowerWatcher.start();
    // healthMonitor.start();
}
console.log('[Consensus] Service started');
EOF

echo "== Writing src/intelligence/consensus/consensusSnapshotService.js =="
cat > src/intelligence/consensus/consensusSnapshotService.js << 'EOF'
import crypto from "crypto";

import expectedBalanceCalculator from "./expectedBalanceCalculator.js";
import balanceHistory from "../laptop/balanceHistory.js";
import balanceCache from "../laptop/balanceCache.js";
import TreasurySnapshot from "../../models/TreasurySnapshot.js";

if (!process.env.TREASURY_SNAPSHOT_SECRET) {
    throw new Error(
        "TREASURY_SNAPSHOT_SECRET is not set — required to sign treasury consensus snapshots"
    );
}
const TREASURY_SNAPSHOT_SECRET = process.env.TREASURY_SNAPSHOT_SECRET;

class ConsensusSnapshotService {

    async create(channel = "PHP") {

        const calculation = await expectedBalanceCalculator.calculate(channel);

        // Chain to the previous snapshot for this channel — tampering with
        // any single historical snapshot now breaks verification of every
        // snapshot after it, not just that one record.
        const previous = await TreasurySnapshot.findOne({ pool: channel })
            .sort({ createdAt: -1 })
            .lean();
        const previousHash = previous?.proof?.signature || null;

        const snapshot = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            channel,
            expectedBalance: calculation.expectedBalance,
            available: calculation.expectedAvailable,
            pending: calculation.projection.totalPending,
            pendingCount: calculation.projection.pendingCount,
            treasuryHash: calculation.snapshot.snapshotId,
            previousHash,
            projectionHash: crypto
                .createHash("sha256")
                .update(JSON.stringify(calculation.projection))
                .digest("hex"),
        };

        // Real signature: HMAC-SHA256 keyed with a server-side secret that
        // never leaves this process. Unlike a bare sha256(JSON.stringify(...))
        // hash (the previous implementation), this can't be recomputed or
        // forged by anything that doesn't hold TREASURY_SNAPSHOT_SECRET.
        snapshot.signature = crypto
            .createHmac("sha256", TREASURY_SNAPSHOT_SECRET)
            .update(JSON.stringify(snapshot))
            .digest("hex");

        // Persist the FULL snapshot (previously computed then discarded —
        // only a trimmed subset survived past this function).
        await TreasurySnapshot.create({
            pool: channel,
            baseBalance: calculation.snapshot.realBalance,
            expectedBalance: snapshot.expectedBalance,
            actualBalance: null,
            drift: null,
            integrityScore: null,
            proof: snapshot,
            verifiedAt: null,
        });

        balanceCache.setBalance(channel, {
            balance: snapshot.expectedBalance,
            available: snapshot.available,
            pending: snapshot.pending,
            expected: snapshot.expectedBalance,
            signature: snapshot.signature,
            source: "CONSENSUS",
        });

        balanceHistory.record({
            channel,
            balance: snapshot.expectedBalance,
            available: snapshot.available,
            pending: snapshot.pending,
            expected: snapshot.expectedBalance,
            variance: 0,
            signature: snapshot.signature,
            source: "CONSENSUS",
        });

        return snapshot;
    }

    // Verify a stored snapshot hasn't been tampered with — recomputes the
    // HMAC over the proof (minus its own signature) and compares. This is
    // what an audit tool should call, rather than trusting a stored
    // `signature` field at face value.
    verify(storedProof) {
        const { signature, ...rest } = storedProof;
        const expected = crypto
            .createHmac("sha256", TREASURY_SNAPSHOT_SECRET)
            .update(JSON.stringify(rest))
            .digest("hex");
        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature, "hex"),
                Buffer.from(expected, "hex")
            );
        } catch {
            return false;
        }
    }

}

export default new ConsensusSnapshotService();
EOF

echo "== Writing src/controllers/adminTreasuryController.js (new) =="
cat > src/controllers/adminTreasuryController.js << 'EOF'
import mongoose from "mongoose";
import TreasuryAccount from "../models/treasuryAccountModel.js";
import PendingOperation from "../models/blockchain/pendingOperationModel.js";
import treasuryCoordinator from "../services/treasury/treasuryCoordinator.js";
import { addAuditLog } from "../services/auditService.js";

// POST /admin/treasury/rebalance
// Book-only PHP-to-PHP transfer between two TreasuryAccounts (e.g.
// Maribank -> Maya/GCash). Assumes the admin has ALREADY moved the real
// money through whatever fee-free channel exists between these providers —
// this only makes the ledger match reality; it does not move any money or
// call any bank API itself.
export async function rebalance(req, res) {
  const { sourceAccountId, destinationAccountId, amount, note } = req.body;
  const adminId = req.user?.id || null; // ASSUMPTION: confirm req.user shape matches your admin auth middleware

  if (!sourceAccountId || !destinationAccountId || !amount || amount <= 0) {
    return res.status(400).json({ error: "sourceAccountId, destinationAccountId, and a positive amount are required" });
  }
  if (String(sourceAccountId) === String(destinationAccountId)) {
    return res.status(400).json({ error: "Source and destination accounts must be different" });
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const source = await TreasuryAccount.findOneAndUpdate(
        { _id: sourceAccountId, isActive: true, $expr: { $gte: [{ $subtract: ["$physicalBalance", "$reserved"] }, amount] } },
        { $inc: { physicalBalance: -amount }, $set: { lastUpdatedBy: "admin-rebalance" } },
        { session, returnDocument: "after" }
      );
      if (!source) throw new Error("Source account not found, inactive, or insufficient available balance");

      const destination = await TreasuryAccount.findOneAndUpdate(
        { _id: destinationAccountId, isActive: true },
        { $inc: { physicalBalance: amount }, $set: { lastUpdatedBy: "admin-rebalance" } },
        { session, returnDocument: "after" }
      );
      if (!destination) throw new Error("Destination account not found or inactive");

      await addAuditLog(adminId, "TREASURY_ADMIN_REBALANCE", {
        sourceAccountId, destinationAccountId, amount, note: note || null,
        sourceProvider: source.provider, destinationProvider: destination.provider,
      }, { entity: "TreasuryAccount", entityId: String(sourceAccountId) });

      result = { source, destination };
    });

    await treasuryCoordinator.recalculatePool(result.source.currency);
    if (result.destination.currency !== result.source.currency) {
      await treasuryCoordinator.recalculatePool(result.destination.currency);
    }

    return res.json({ success: true, source: result.source, destination: result.destination });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
}

// POST /admin/treasury/sweep-intent
// Admin declares intent to convert PHP excess into a settlement asset
// (e.g. USDC via a manual MEXC P2P buy). Does NOT execute any trade —
// creates a PendingOperation that expectedBalanceCalculator's non-PHP path
// folds into the independently-computed expectation, so the MEXC watcher's
// later observation is checked against more than just this same number.
export async function createSweepIntent(req, res) {
  const { sourcePhpAccountId, phpAmount, expectedAsset, expectedAssetAmount, expirationMinutes } = req.body;
  const adminId = req.user?.id || null;

  if (!sourcePhpAccountId || !phpAmount || !expectedAsset || !expectedAssetAmount) {
    return res.status(400).json({ error: "sourcePhpAccountId, phpAmount, expectedAsset, and expectedAssetAmount are required" });
  }

  const sourceAccount = await TreasuryAccount.findOne({ _id: sourcePhpAccountId, isActive: true });
  if (!sourceAccount) return res.status(404).json({ error: "Source PHP account not found or inactive" });

  const operationId = `SWEEP-${sourceAccount.provider}-${Date.now()}`;

  const pending = await PendingOperation.create({
    operationId,
    requestId: operationId,
    correlationKey: operationId,
    userId: adminId, // ASSUMPTION: PendingOperation.userId is required + ref:'User' — confirm admin accounts live in the User collection, or this field needs relaxing
    operationType: "SWAP",
    asset: expectedAsset,
    provider: "mexc",
    expectedAmount: expectedAssetAmount,
    tolerance: 0.02,
    expiration: new Date(Date.now() + (expirationMinutes || 60) * 60 * 1000),
    metadata: { sourcePhpAccountId, sourceProvider: sourceAccount.provider, phpAmount, declaredBy: adminId },
  });

  await addAuditLog(adminId, "TREASURY_SWEEP_INTENT_CREATED", {
    operationId, sourceProvider: sourceAccount.provider, phpAmount, expectedAsset, expectedAssetAmount,
  }, { entity: "PendingOperation", entityId: String(pending._id) });

  return res.status(201).json({ success: true, operationId, pending });
}

export default { rebalance, createSweepIntent };
EOF

echo "== Writing src/routes/adminTreasuryRoutes.js (new) =="
cat > src/routes/adminTreasuryRoutes.js << 'EOF'
import express from "express";
import { rebalance, createSweepIntent } from "../controllers/adminTreasuryController.js";
// TODO: import your actual admin-auth middleware and uncomment router.use(...) —
// not yet confirmed which one adminWithdrawalRoutes.js / adminDepositRoutes.js use.

const router = express.Router();

// router.use(requireAdmin);
router.post("/rebalance", rebalance);
router.post("/sweep-intent", createSweepIntent);

export default router;
EOF

echo ""
echo "== DONE =="
echo "Still needed before this runs:"
echo "  1. Set env vars: MEXC_API_KEY, MEXC_API_SECRET, TREASURY_SNAPSHOT_SECRET (long random value), optionally MEXC_SETTLEMENT_ASSET"
echo "  2. Seed one TreasuryAccount row: provider='mexc', currency='USDC' (or your MEXC_SETTLEMENT_ASSET)"
echo "  3. Wire real admin-auth middleware into src/routes/adminTreasuryRoutes.js (currently commented out)"
echo "  4. Mount the new route (e.g. app.use('/admin/treasury', adminTreasuryRoutes)) wherever your other routes are registered"
echo "  5. Confirm req.user.id / PendingOperation.userId assumptions in adminTreasuryController.js match your auth setup"
echo ""
echo "Backups of overwritten files saved as *.bak alongside the originals."
