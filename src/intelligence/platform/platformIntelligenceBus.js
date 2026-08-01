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

        missionControlAggregator.process(
            normalized
        );

        executionGraph.record(normalized);
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
    previous: ["treasuryCoordinator"],
    next: ["intelligenceEventFactory"],
    dependsOn: ["intelligenceEventFactory", "eventGraphService", "correlationEngine", "activityEngine", "treasuryIntelligenceBus", "incidentEngine"],
    criticality: "HIGH",
    notes: "Only confirmed caller is treasuryCoordinator.js — non-treasury sources do not yet publish to this bus."
};

export default platformIntelligenceBus;
