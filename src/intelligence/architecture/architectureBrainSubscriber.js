import brainBus from "../../brainbus/brainBus.js";
import architectureEventBridge from "./architectureEventBridge.js";

class ArchitectureBrainSubscriber {

    constructor() {

        this.channels = [

            "inspector.flow.started",
            "inspector.flow.stage",
            "inspector.flow.completed",
            "inspector.flow.deviation",

            "decision.executed",
            "decision.failed",

            "operator.incident",

            "session.created",

            "deposit.verified",
            "deposit.credited",

            "treasury.drift"

        ];

    }

    start() {

        for (const channel of this.channels) {

            brainBus.on(channel, payload => {

                const component =

                    payload?.component ||

                    payload?.stage ||

                    payload?.source ||

                    payload?.service ||

                    payload?.worker ||

                    payload?.executor ||

                    payload?.controller ||

                    payload?.consumer ||

                    payload?.scheduler;

                if (!component)
                    return;

                if (
                    channel.endsWith(".started")
                ) {

                    architectureEventBridge.started(
                        component,
                        payload
                    );

                    return;
                }

                if (
                    channel.endsWith(".completed") ||
                    channel.endsWith(".executed") ||
                    channel === "deposit.credited"
                ) {

                    architectureEventBridge.completed(
                        component
                    );

                    return;
                }

                if (
                    channel.endsWith(".failed") ||
                    channel.endsWith(".deviation") ||
                    channel === "operator.incident"
                ) {

                    architectureEventBridge.failed(
                        component,
                        payload
                    );

                }

            });

        }

        console.log(
            "[ArchitectureBrainSubscriber] Listening on",
            this.channels.length,
            "BrainBus channels."
        );

    }

}

export default new ArchitectureBrainSubscriber();
