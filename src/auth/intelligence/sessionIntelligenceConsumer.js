import brainBus from "../../brainbus/brainBus.js";
import { Channels } from "../../brainbus/channels.js";
import Session from "../models/sessionModel.js";

class SessionIntelligenceConsumer {

    start() {

        brainBus.on(Channels.SESSION_CREATED, async (envelope) => {

            try {

                const session = envelope.payload;

                const previous = await Session.find({
                    userId: session.userId,
                    sessionId: { $ne: session.sessionId }
                })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

                const analysis = this.analyze(session, previous);

                brainBus.emit(
                    Channels.SESSION_RISK,
                    {
                        ...session,
                        risk: analysis.risk,
                        score: analysis.score,
                        reasons: analysis.reasons
                    },
                    {
                        source: "SessionIntelligenceConsumer"
                    }
                );

                if (analysis.score >= 70) {

                    brainBus.emit(
                        Channels.SESSION_ANOMALY,
                        {
                            ...session,
                            risk: analysis.risk,
                            score: analysis.score,
                            reasons: analysis.reasons
                        },
                        {
                            source: "SessionIntelligenceConsumer"
                        }
                    );

                }

            } catch (err) {

                console.error(
                    "[SessionIntelligenceConsumer]",
                    err.message
                );

            }

        });

        console.log(
            "[SessionIntelligenceConsumer] Listening on",
            Channels.SESSION_CREATED
        );

    }

    analyze(current, previous) {

        let score = current.risk?.score || 0;

        const reasons = [];

        if (!previous.length) {

            return {
                risk: "LOW",
                score,
                reasons: ["First known session"]
            };

        }

        const fingerprints = new Set(
            previous.map(x => x.fingerprint).filter(Boolean)
        );

        if (
            current.fingerprint &&
            !fingerprints.has(current.fingerprint)
        ) {
            score += 20;
            reasons.push("New device fingerprint");
        }

        const ips = new Set(
            previous.map(x => x.ip).filter(Boolean)
        );

        if (
            current.ip &&
            !ips.has(current.ip)
        ) {
            score += 20;
            reasons.push("New IP address");
        }

        const browsers = new Set(
            previous.map(x => x.browser).filter(Boolean)
        );

        if (
            current.browser &&
            !browsers.has(current.browser)
        ) {
            score += 10;
            reasons.push("New browser");
        }

        const risk =
            score >= 70 ? "HIGH" :
            score >= 40 ? "MEDIUM" :
            "LOW";

        return {
            risk,
            score,
            reasons
        };

    }

}

export default new SessionIntelligenceConsumer();
