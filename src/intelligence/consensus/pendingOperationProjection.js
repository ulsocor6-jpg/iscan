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
