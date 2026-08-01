import treasuryWatcher from "./treasuryWatcher.js";
import balanceCache from "./balanceCache.js";
import expectedBalanceCalculator from "../consensus/expectedBalanceCalculator.js";

class LaptopConsensusProvider {

    async verify(channel, observedBalance) {

        const latest =
            balanceCache.getBalance(channel);

        const calculation =
            await expectedBalanceCalculator.calculate(channel);

        const expectedBalance =
            calculation.expectedBalance;

        if (!latest) {

            return {

                verified: false,

                reason: "NO_LAPTOP_SNAPSHOT",

                expectedBalance,

                observedBalance: null,

                projection: calculation.projection,

                treasury: calculation.snapshot

            };

        }

        const snapshot =
            treasuryWatcher.update(channel, {

                balance: latest.balance,

                available: latest.available,

                reserved: latest.reserved,

                pending: latest.pending,

                expected: expectedBalance

            });

        return {

            verified:
                Number(observedBalance) === Number(expectedBalance),

            expectedBalance,

            observedBalance:
                snapshot.balance,

            variance:
                snapshot.variance,

            confidence:
                snapshot.variance === 0 ? 100 : 0,

            projection:
                calculation.projection,

            treasury:
                calculation.snapshot,

            signature:
                snapshot.signature,

            snapshot

        };

    }

}

export default new LaptopConsensusProvider();
