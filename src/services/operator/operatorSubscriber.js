import blockchainInspector from "../blockchain/inspector/blockchainInspector.js";
import eventStreamService from "../eventStreamService.js";
import remediationEngine from "./remediationEngine.js";
import platformIntelligenceBus from "../../intelligence/platform/platformIntelligenceBus.js";

class OperatorSubscriber {

    start() {

        console.log("[Operator] Listening to Blockchain Inspector...");

        blockchainInspector.on("event", async (event) => {

            
console.log("\n===== RAW INSPECTOR EVENT =====");
console.dir(event,{depth:8});
console.log("===============================\n");

// Routed through platformIntelligenceBus instead of calling
// incidentEngine.process() directly — the bus normalizes, graphs,
// correlates, records to Activity/Mission Control, THEN calls
// incidentEngine.process() itself as its final step. This makes every
// event (not just treasury) visible in Mission Control live state.
const busResult = await platformIntelligenceBus.publish(event);
const incident = busResult.incident;


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

            // Fire-and-forget: attemptRemediation() is a no-op for any
            // code not in remediationEngine's WHITELIST, and it already
            // catches its own handler errors internally. Never let this
            // block or crash the event loop.
            remediationEngine.attemptRemediation(incident).catch((err) => {
                console.error(
                    "[Operator] Remediation attempt threw unexpectedly:",
                    err.message
                );
            });

        });

    }

}

export default new OperatorSubscriber();
