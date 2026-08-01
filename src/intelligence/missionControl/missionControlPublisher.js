import missionControlAggregator from "./missionControlAggregator.js";

class MissionControlPublisher {

    publish(event = {}) {

        return missionControlAggregator.process({

            timestamp: new Date().toISOString(),

            level: event.level || "INFO",

            component: event.component || null,

            stage: event.stage || null,

            type: event.type || null,

            session: event.session || null,

            sessionId: event.sessionId || null,

            metadata: event.metadata || {},

            message: event.message || null

        });

    }

    started(component, metadata = {}) {

        return this.publish({

            component,

            stage: component,

            type: "COMPONENT_STARTED",

            level: "INFO",

            metadata,

            message: `${component} started`

        });

    }

    completed(component, metadata = {}) {

        return this.publish({

            component,

            stage: component,

            type: "COMPONENT_COMPLETED",

            level: "SUCCESS",

            metadata,

            message: `${component} completed`

        });

    }

    failed(component, error) {

        return this.publish({

            component,

            stage: component,

            type: "COMPONENT_FAILED",

            level: "ERROR",

            metadata: {

                error:
                    error?.message ||
                    String(error)

            },

            message:
                error?.message ||
                String(error)

        });

    }

}

export default new MissionControlPublisher();
