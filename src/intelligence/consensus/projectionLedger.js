import DirectDeposit from "../../models/DirectDepositModel.js";

class ProjectionLedger {

    async build(channel = null) {

        const query = {
            status: "PENDING",
            expiresAt: { $gt: new Date() }
        };

        if (channel) {
            query.channel = channel;
        }

        const deposits = await DirectDeposit.find(query)
            .sort({ createdAt: 1 })
            .lean();

        const totalPending = deposits.reduce(
            (sum, deposit) => sum + Number(deposit.amount || 0),
            0
        );

        return {

            generatedAt: new Date(),

            pendingCount: deposits.length,

            totalPending,

            deposits

        };

    }

}

export default new ProjectionLedger();
