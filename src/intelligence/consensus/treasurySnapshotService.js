import crypto from "crypto";
import PhpLiquidityPool from "../../models/phpLiquidityPool.js";

class TreasurySnapshotService {

    async capture(currency = "PHP") {

        const pool = await PhpLiquidityPool.findOne({ currency });

        if (!pool) {
            throw new Error(`Liquidity pool not found: ${currency}`);
        }

        const realBalance = Number(pool.balance || 0);
        const reserved = Number(pool.reserved || 0);

        const pendingIncoming = Number(
            pool.metadata?.pendingIncoming || 0
        );

        const pendingOutgoing = Number(
            pool.metadata?.pendingOutgoing || 0
        );

        const available = realBalance - reserved;

        return {

            snapshotId: crypto.randomUUID(),

            currency,

            timestamp: new Date(),

            realBalance,

            reserved,

            available,

            pendingIncoming,

            pendingOutgoing,

            metadata: {

                minThreshold: pool.minThreshold,

                totalSwappedIn: pool.totalSwappedIn,

                totalSwappedOut: pool.totalSwappedOut

            }

        };

    }

}

export default new TreasurySnapshotService();
