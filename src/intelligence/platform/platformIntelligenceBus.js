import incidentEngine from "../../services/operator/incidentEngine.js";
import intelligenceEventFactory from "./intelligenceEventFactory.js";
import treasuryIntelligenceBus from "../consensus/treasuryIntelligenceBus.js";
import eventGraphService from "../correlation/eventGraphService.js";
import correlationEngine from "../correlation/correlationEngine.js";
import missionControlAggregator from "../missionControl/missionControlAggregator.js";
import executionGraph from "../correlation/executionGraph.js";
import activityEngine from "../activity/activityEngine.js";
import architectureEventBridge from "../architecture/architectureEventBridge.js";

class PlatformIntelligenceBus {

    constructor() {

        this.handlers = [];

        this.register(async event => {

            if (event.stage !== "treasury") {
                return null;
            }

            return treasuryIntelligenceBus.process({
                channel: event.metadata.currency,
                observedBalance: event.metadata.observedBalance
            });

        });

    }

    register(handler) {

        this.handlers.push(handler);

    }

    async publish(event = {}) {

        architectureEventBridge.started("platformIntelligenceBus", { stage: event.stage });

        architectureEventBridge.started("intelligenceEventFactory");
        const normalized =
            intelligenceEventFactory.create(event);
        architectureEventBridge.completed("intelligenceEventFactory");

        architectureEventBridge.started("eventGraphService");
        const graphNode =
            eventGraphService.create(normalized);
        architectureEventBridge.completed("eventGraphService");

        normalized.id =
            graphNode.id;

        architectureEventBridge.started("correlationEngine");
        const session =
            correlationEngine.correlate(normalized);
        architectureEventBridge.completed("correlationEngine");

        normalized.session =
            session;

        architectureEventBridge.started("activityEngine");
        activityEngine.record(normalized);

        // Wrapped defensively — a failure in either of these must never
        // block incidentEngine.process() further down in this function.
        // executionGraph.record() was throwing "is not a function" on
        // every single event before this fix, which meant NO incidents
        // were being created at all, including real treasury DEADLOCKs.
        try {

            missionControlAggregator.process(
                normalized
            );

        } catch (err) {

            console.error(
                "[PlatformIntelligenceBus] missionControlAggregator.process() failed — non-fatal, continuing:",
                err.message
            );

        }

        try {

            executionGraph.record(normalized);

        } catch (err) {

            console.error(
                "[PlatformIntelligenceBus] executionGraph.record() failed — non-fatal, continuing:",
                err.message
            );

        }

        architectureEventBridge.completed("activityEngine");

        const results = [];

        for (const handler of this.handlers) {

            results.push(
                await handler(normalized)
            );


        }

        architectureEventBridge.started("incidentEngine");
        const incident =
            incidentEngine.process(normalized);
        architectureEventBridge.completed("incidentEngine");

        architectureEventBridge.completed("platformIntelligenceBus");

        return {

            timestamp: new Date(),

            event: normalized,

            incident,

            handlers: results

        };

    }

}

const platformIntelligenceBus = new PlatformIntelligenceBus();

platformIntelligenceBus.descriptor = {
    id: "platformIntelligenceBus",
    name: "Platform Intelligence Bus",
    type: "bridge",
    domain: "intelligence",
    description: "Central publish pipeline for intelligence events; normalizes, graphs, correlates, records, and dispatches to stage handlers.",
    previous: ["treasuryCoordinator", "operatorSubscriber"],
    next: ["intelligenceEventFactory"],
    dependsOn: ["intelligenceEventFactory", "eventGraphService", "correlationEngine", "activityEngine", "treasuryIntelligenceBus", "incidentEngine"],
    criticality: "HIGH",
    notes: "Confirmed live callers: treasuryCoordinator.js (stage: 'treasury', on every pool recalculation) and operatorSubscriber.js (every blockchainInspector event, all stages). Non-treasury events flow through the bus's normalize/graph/correlate/record steps but skip the bus's only registered handler (treasury-stage-only) and go straight to incidentEngine.process()."
};

export default platformIntelligenceBus;
