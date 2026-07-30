import activityRegistry from "./activityRegistry.js";

class ActivityEngine {

    static descriptor = {

        name: "Activity Engine",

        domain: "intelligence",

        type: "activity_engine",

        purpose:
            "Tracks live user, operator and system activity for Mission Control."

    };

    record(event = {}) {

        return activityRegistry.update(event);

    }

    finish(sessionId) {

        return activityRegistry.finish(sessionId);

    }

    getSession(sessionId) {

        return activityRegistry
            .list()
            .find(s => s.id === sessionId) || null;

    }

    getSessions() {

        return activityRegistry.list();

    }

    getActiveSessions() {

        return activityRegistry.active();

    }

    getSummary() {

        return activityRegistry.summary();

    }

}

const activityEngine = new ActivityEngine();

activityEngine.descriptor = {
    id: "activityEngine",
    name: "Activity Engine",
    type: "repository",
    domain: "intelligence",
    description: "Records every bus-published event into the recent activity feed.",
    previous: ["correlationEngine"],
    next: ["treasuryIntelligenceBus"],
    dependsOn: [],
    criticality: "MEDIUM",
    notes: "next is scoped to stage === 'treasury' — the bus's only registered handler today."
};

export default activityEngine;
