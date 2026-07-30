import consensusSnapshotService from "./consensusSnapshotService.js";
import varianceDetectionEngine from "./varianceDetectionEngine.js";
import incidentEngine from "../../services/operator/incidentEngine.js";
import architectureEventBridge from "../architecture/architectureEventBridge.js";

class TreasuryIntelligenceBus {

    async process({

        channel = "PHP",

        observedBalance

    }) {

        architectureEventBridge.started("consensusSnapshotService");
        const snapshot =
            await consensusSnapshotService.create(channel);
        architectureEventBridge.completed("consensusSnapshotService");

        architectureEventBridge.started("varianceDetectionEngine");
        const variance =
            await varianceDetectionEngine.analyze({

                channel,

                observedBalance

            });
        architectureEventBridge.completed("varianceDetectionEngine");

        const event = {

            stage: "treasury",

            level: variance.healthy ? "INFO" : "ERROR",

            message: variance.healthy
                ? "Treasury integrity verified."
                : "Treasury integrity check failed.",

            metadata: {
                currency: channel,
                status: variance.healthy ? "HEALTHY" : "TREASURY_VARIANCE",
                variance: variance.variance,
                expected: variance.expectedBalance,
                observed: variance.observedBalance,
                snapshot,
                consensus: variance
            }

        };

        architectureEventBridge.started("incidentEngine");
        const incident =
            incidentEngine.process(event);
        architectureEventBridge.completed("incidentEngine");

        return {

            timestamp: new Date(),

            snapshot,

            variance,

            incident,

            healthy: variance.healthy

        };

    }

}

const treasuryIntelligenceBus = new TreasuryIntelligenceBus();

treasuryIntelligenceBus.descriptor = {
    id: "treasuryIntelligenceBus",
    name: "Treasury Intelligence Bus",
    type: "bridge",
    domain: "intelligence",
    description: "Handles treasury-stage events: creates a consensus snapshot, runs variance detection, and raises incidents.",
    previous: ["activityEngine"],
    next: ["consensusSnapshotService", "varianceDetectionEngine"],
    dependsOn: ["consensusSnapshotService", "varianceDetectionEngine", "incidentEngine"],
    criticality: "HIGH"
};

export default treasuryIntelligenceBus;
