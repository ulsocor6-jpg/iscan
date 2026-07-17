import blockchainInspector from "../blockchain/inspector/blockchainInspector.js";
import eventStreamService from "../eventStreamService.js";
import incidentEngine from "./incidentEngine.js";

class OperatorSubscriber {

    start() {

        console.log("[Operator] Listening to Blockchain Inspector...");

        blockchainInspector.on("event", async (event) => {

            const incident = incidentEngine.process(event);

            if (!incident) return;

            console.log("");

            console.log("========== OPERATOR ==========");

            console.log("Severity :", incident.severity);

            console.log("Diagnosis:", incident.diagnosis);

            console.log("Action   :", incident.recommendation);

            console.log("==============================");

            console.log("");

            try {

                await eventStreamService.emit(
                    "operator.incident",
                    {

                        severity: incident.severity,

                        diagnosis: incident.diagnosis,

                        recommendation:
                            incident.recommendation,

                        status: incident.status,

                        orderId: incident.orderId,

                        source: incident.source,

                        incidentId: incident.id,

                        createdAt: incident.createdAt

                    }
                );

            } catch(err){

                console.error(
                    "[Operator] Failed to publish incident:",
                    err.message
                );

            }

        });

    }

}

export default new OperatorSubscriber();
