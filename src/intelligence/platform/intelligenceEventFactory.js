import crypto from "crypto";

class IntelligenceEventFactory {

    create({

        stage,

        source,

        level = "INFO",

        type = "SYSTEM",

        message = "",

        metadata = {}

    }) {

        return {

            id: crypto.randomUUID(),

            timestamp: new Date(),

            stage,

            source,

            type,

            level,

            message,

            metadata,

            correlationId:

                metadata.correlationId ||

                metadata.referenceId ||

                null

        };

    }

}

const intelligenceEventFactory = new IntelligenceEventFactory();

intelligenceEventFactory.descriptor = {
    id: "intelligenceEventFactory",
    name: "Intelligence Event Factory",
    type: "parser",
    domain: "intelligence",
    description: "Normalizes raw events into the standard intelligence event shape.",
    previous: ["platformIntelligenceBus"],
    next: ["eventGraphService"],
    dependsOn: [],
    criticality: "MEDIUM"
};

export default intelligenceEventFactory;
