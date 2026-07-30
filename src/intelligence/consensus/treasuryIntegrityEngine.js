import expectedBalanceCalculator from "./expectedBalanceCalculator.js";

class TreasuryIntegrityEngine {

    async verify({

        channel = null,

        observedBalance,

        tolerance = 0

    }) {

        const calculation =
            await expectedBalanceCalculator.calculate(channel);

        const variance =
            Number(observedBalance) -
            Number(calculation.expectedBalance);

        const healthy =
            Math.abs(variance) <= tolerance;

        return {

            timestamp: new Date(),

            healthy,

            observedBalance: Number(observedBalance),

            expectedBalance: calculation.expectedBalance,

            variance,

            tolerance,

            snapshot: calculation.snapshot,

            projection: calculation.projection

        };

    }

}

export default new TreasuryIntegrityEngine();
