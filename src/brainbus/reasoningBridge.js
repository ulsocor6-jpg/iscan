// src/brainbus/reasoningBridge.js
// ────────────────────────────────────────────────────────────────────────────
// Connects the Reasoning Engine to BrainBus.
//
// Listens for inspector flow stage events, runs the reasoning engine,
// and publishes verdicts back onto the bus.  Also feeds deviations to the
// operator incident channel.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";
import reasoningEngine from "../intelligence/reasoningEngine.js";
import liveMemoryStore from "./liveMemoryStore.js";

class ReasoningBridge {

    start() {

        // ── Listen to every flow stage advancement ──────────────────────
        brainBus.on(Channels.INSPECTOR_FLOW_STAGE, (envelope) => {
            const { flowId, stage, data } = envelope.payload;

            // Get the full flow from Live Memory (no MongoDB round-trip)
            const flow = liveMemoryStore.getFlow(flowId);
            if (!flow) {
                // Flow not yet cached — this happens on first stage before
                // Live Memory has the full flow.  Skip; the next stage will
                // have it.
                return;
            }

            // Update the flow's stage list with this new stage info
            if (!flow.stages) flow.stages = [];
            const existing = flow.stages.find(s => s.name === stage);
            if (existing) {
                Object.assign(existing, data);
            } else {
                flow.stages.push({ name: stage, status: data.status || "RUNNING", ...data });
            }

            // Run the reasoning engine against the full flow
            const verdict = reasoningEngine.analyzeFlow(flow);

            if (!verdict) return;

            // Always publish the verdict
            brainBus.emit(Channels.REASONING_VERDICT, {
                flowId,
                pipeline: flow.pipeline,
                currentStage: stage,
                verdict: verdict.verdict,
                message: verdict.message,
                details: verdict,
                timestamp: new Date().toISOString()
            }, {
                source: "ReasoningEngine",
                correlationId: flowId
            });

            // Deviations → operator incidents
            if (verdict.verdict === "GAP_DETECTED" ||
                verdict.verdict === "STALLED" ||
                verdict.verdict === "FAILED_AT_STAGE" ||
                verdict.verdict === "UNKNOWN_PIPELINE") {

                brainBus.emit(Channels.OPERATOR_INCIDENT, {
                    flowId,
                    pipeline: flow.pipeline,
                    type: verdict.verdict,
                    severity: verdict.verdict === "STALLED" ? "WARN" : "HIGH",
                    diagnosis: verdict.message,
                    recommendation: verdict.missingStages
                        ? `Missing stages: ${verdict.missingStages.join(", ")}. Check code path.`
                        : "Review flow in Inspector dashboard."
                }, {
                    source: "ReasoningEngine",
                    correlationId: flowId
                });
            }
        });

        // ── Also listen for new flows so we can seed Live Memory ────────
        brainBus.on(Channels.INSPECTOR_FLOW_STARTED, (envelope) => {
            // Flow is already cached by Live Memory's own listener.
            // We just run an initial analysis to set the baseline verdict.
            const flow = envelope.payload;
            const verdict = reasoningEngine.analyzeFlow(flow);
            if (verdict) {
                brainBus.emit(Channels.REASONING_VERDICT, {
                    flowId: flow.flowId,
                    pipeline: flow.pipeline,
                    currentStage: null,
                    verdict: verdict.verdict,
                    message: verdict.message,
                    timestamp: new Date().toISOString()
                }, {
                    source: "ReasoningEngine",
                    correlationId: flow.flowId
                });
            }
        });

        console.log("[ReasoningBridge] ✅ Listening on inspector.flow.* — publishing verdicts to reasoning.verdict");
    }
}

const reasoningBridge = new ReasoningBridge();
export default reasoningBridge;
