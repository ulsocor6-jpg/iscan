import mongoose from "mongoose";
import TreasuryAccount from "../models/treasuryAccountModel.js";
import PendingOperation from "../models/blockchain/pendingOperationModel.js";
import treasuryCoordinator from "../services/treasury/treasuryCoordinator.js";
import { addAuditLog } from "../services/auditService.js";
import { getAssetBalance } from "../integrations/mexcClient.js";
import { watchPendingOperation } from "../intelligence/laptop/mexcWatcher.js";

// POST /admin/treasury/rebalance
export async function rebalance(req, res) {
  const { sourceAccountId, destinationAccountId, amount, note } = req.body;
  const adminId = req.user?.id || null;

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
export async function createSweepIntent(req, res) {
  const { sourcePhpAccountId, phpAmount, expectedAsset, expectedAssetAmount, expirationMinutes } = req.body;
  const adminId = req.user?.id || null;

  if (!sourcePhpAccountId || !phpAmount || !expectedAsset || !expectedAssetAmount) {
    return res.status(400).json({ error: "sourcePhpAccountId, phpAmount, expectedAsset, and expectedAssetAmount are required" });
  }

  const sourceAccount = await TreasuryAccount.findOne({ _id: sourcePhpAccountId, isActive: true });
  if (!sourceAccount) return res.status(404).json({ error: "Source PHP account not found or inactive" });

  const { free: baselineBalance } = await getAssetBalance(expectedAsset);

  const operationId = `SWEEP-${sourceAccount.provider}-${Date.now()}`;

  const pending = await PendingOperation.create({
    operationId,
    requestId: operationId,
    correlationKey: operationId,
    userId: adminId,
    operationType: "SWAP",
    asset: expectedAsset,
    provider: "mexc",
    expectedAmount: expectedAssetAmount,
    tolerance: 0.02,
    expiration: new Date(Date.now() + (expirationMinutes || 60) * 60 * 1000),
    metadata: { sourcePhpAccountId, sourceProvider: sourceAccount.provider, phpAmount, declaredBy: adminId, baselineBalance },
  });

  await addAuditLog(adminId, "TREASURY_SWEEP_INTENT_CREATED", {
    operationId, sourceProvider: sourceAccount.provider, phpAmount, expectedAsset, expectedAssetAmount, baselineBalance,
  }, { entity: "PendingOperation", entityId: String(pending._id) });

  watchPendingOperation(operationId);

  return res.status(201).json({ success: true, operationId, baselineBalance, pending });
}

// GET /admin/treasury/sweep-intents
// Read-only list of MEXC sweep intents (PendingOperation records with
// provider: 'mexc') for the admin UI to display current/recent status.
export async function listSweepIntents(req, res) {
  const operations = await PendingOperation.find({ provider: "mexc" })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.json({ success: true, operations });
}

export default { rebalance, createSweepIntent, listSweepIntents };
