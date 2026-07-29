import brainBus from "../../brainbus/brainBus.js";
import { Channels } from "../../brainbus/channels.js";

class SessionIntelligencePublisher {

    publish(context, risk) {

        brainBus.emit(

            Channels.SESSION_CREATED,

            {

                sessionId: context.sessionId,

                userId: context.userId,

                ip: context.ip,

                userAgent: context.userAgent,

                timezone: context.timezone,

                fingerprint: context.metadata?.fingerprint,

                risk

            },

            {

                source: "SessionIntelligence"

            }

        );

    }

}

export default new SessionIntelligencePublisher();
