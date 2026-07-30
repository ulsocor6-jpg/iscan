import treasuryIntegrityEngine from "./treasuryIntegrityEngine.js";

class ConsensusEngine {

    async evaluate({

        channel = null,

        observedBalance,

        referenceVerified = false,

        androidVerified = false,

        laptopVerified = false,

        senderVerified = false,

        inspectorHealthy = true,

        tolerance = 0

    }) {

        const treasury =
            await treasuryIntegrityEngine.verify({

                channel,

                observedBalance,

                tolerance

            });

        const checks = {

            referenceVerified,

            androidVerified,

            laptopVerified,

            senderVerified,

            inspectorHealthy,

            treasuryHealthy: treasury.healthy

        };

        const totalChecks =
            Object.keys(checks).length;

        const passedChecks =
            Object.values(checks)
                .filter(Boolean)
                .length;

        const score =
            Math.round(
                (passedChecks / totalChecks) * 100
            );

        let decision = "PASS";

        if (!treasury.healthy) {
            decision = "FAIL";
        }
        else if (
            !referenceVerified ||
            !androidVerified ||
            !senderVerified
        ) {
            decision = "REVIEW";
        }
        else if (!laptopVerified) {
            decision = "REVIEW";
        }

        return {

            timestamp: new Date(),

            decision,

            score,

            confidence: score,

            checks,

            treasury,

            reasons: Object.entries(checks)
                .filter(([, value]) => !value)
                .map(([key]) => key)

        };

    }

}

const consensusEngine = new ConsensusEngine();

consensusEngine.descriptor = {
    id: "consensusEngine",
    name: "Consensus Engine",
    type: "engine",
    domain: "intelligence",
    description: "Verifies deposit consensus; reached only via consensusVerificationService.",
    previous: [],
    next: [],
    dependsOn: [],
    criticality: "LOW",
    notes: "consensusVerificationService is called from depositVerificationService.js, which has no confirmed callers anywhere in src/ — this branch appears disconnected from any live route today."
};

export default consensusEngine;
