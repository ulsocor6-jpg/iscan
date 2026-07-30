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
