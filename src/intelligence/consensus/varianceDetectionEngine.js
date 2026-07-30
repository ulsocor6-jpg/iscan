import expectedBalanceCalculator from "./expectedBalanceCalculator.js";

class VarianceDetectionEngine {

    async analyze({

        channel = "PHP",

        observedBalance,

        tolerance = 0

    }) {

        const calculation =
            await expectedBalanceCalculator.calculate(channel);

        const variance =
            Number(observedBalance) -
            Number(calculation.expectedBalance);

        const findings = [];

        if (Math.abs(variance) > tolerance) {

            findings.push({

                code: "TREASURY_VARIANCE",

                severity: "CRITICAL",

                message:
                    `Treasury variance detected (${variance}).`

            });

        }

        if (calculation.expectedBalance < 0) {

            findings.push({

                code: "NEGATIVE_EXPECTED_BALANCE",

                severity: "CRITICAL",

                message:
                    "Expected treasury balance became negative."

            });

        }

        if (calculation.projection.pendingCount > 100) {

            findings.push({

                code: "HIGH_PENDING_VOLUME",

                severity: "WARNING",

                message:
                    "Large number of pending deposits."

            });

        }

        if (

            calculation.snapshot.available < 0

        ) {

            findings.push({

                code: "NEGATIVE_AVAILABLE",

                severity: "CRITICAL",

                message:
                    "Available liquidity is below zero."

            });

        }

        return {

            timestamp: new Date(),

            healthy:
                findings.length === 0,

            variance,

            expectedBalance:
                calculation.expectedBalance,

            observedBalance:
                Number(observedBalance),

            findings,

            snapshot:
                calculation.snapshot,

            projection:
                calculation.projection

        };

    }

}

const varianceDetectionEngine = new VarianceDetectionEngine();

varianceDetectionEngine.descriptor = {
    id: "varianceDetectionEngine",
    name: "Variance Detection Engine",
    type: "engine",
    domain: "intelligence",
    description: "Analyzes observed vs. expected treasury balance and reports variance.",
    previous: ["treasuryIntelligenceBus"],
    next: ["incidentEngine"],
    dependsOn: [],
    criticality: "HIGH"
};

export default varianceDetectionEngine;
