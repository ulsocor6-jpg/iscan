import correlationRepository from "./correlationRepository.js";
import SessionType from "./correlationTypes.js";

class CorrelationEngine {

    correlate(event = {}) {

        const sessionId =
            event.sessionId ||
            event.referenceId ||
            event.metadata?.referenceId ||
            event.orderId ||
            event.metadata?.orderId ||
            event.id;

        let session =
            correlationRepository.get(sessionId);

        if (!session) {

            session = {

                id: sessionId,

                type:
                    this.detectType(event),

                createdAt:
                    new Date(),

                updatedAt:
                    new Date(),

                events: [],

                status: "ACTIVE"

            };

        }

        session.events.push({

            id: event.id,

            stage: event.stage,

            type: event.type,

            level: event.level,

            timestamp:
                new Date()

        });

        session.updatedAt =
            new Date();

        correlationRepository.save(session);

        return session;

    }

    detectType(event = {}) {

        const stage =
            (event.stage || "").toLowerCase();

        if (stage.includes("deposit"))
            return SessionType.DEPOSIT;

        if (stage.includes("withdraw"))
            return SessionType.WITHDRAWAL;

        if (stage.includes("treasury"))
            return SessionType.TREASURY;

        if (stage.includes("settlement"))
            return SessionType.SETTLEMENT;

        return SessionType.PLATFORM;

    }

}

const correlationEngine = new CorrelationEngine();

correlationEngine.descriptor = {
    id: "correlationEngine",
    name: "Correlation Engine",
    type: "engine",
    domain: "intelligence",
    description: "Groups normalized events into correlation sessions.",
    previous: ["eventGraphService"],
    next: ["activityEngine"],
    dependsOn: [],
    criticality: "MEDIUM",
    notes: "Distinct from src/brainbus/predictions/correlationEngine.js, which serves the older operator path and is not part of this pipeline."
};

export default correlationEngine;
