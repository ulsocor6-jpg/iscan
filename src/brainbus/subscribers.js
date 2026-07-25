import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";

export async function wireBrainBus() {
    brainBus.start();

    // ── Reasoning Bridge (flow stages → verdicts → operator) ──────────
    try {
        const { default: reasoningBridge } = await import("./reasoningBridge.js");
        reasoningBridge.start();
        console.log("[BrainBus] ✓ Reasoning Bridge wired");
    } catch (e) {
        console.warn("[BrainBus] ⚠ Reasoning Bridge not available:", e.message);
    }

    try {
        const { default: eventStreamService } = await import("../services/eventStreamService.js");
        brainBus.on(Channels.OPERATOR_INCIDENT, async (envelope) => {
            const p = envelope.payload || {};
            console.log(`[BrainBus] -> Operator: incident ${p.type || p.code || "unknown"} for ${p.flowId || p.address || p.orderId || "unknown"}`);

            try {
                await eventStreamService.emit("operator.incident", {
                    severity: p.severity || "WARNING",
                    diagnosis: p.diagnosis || p.title || p.summary || p.message || "No details provided",
                    recommendation: p.recommendation || "Review in Inspector dashboard.",
                    source: p.source || envelope.meta?.source || "brainBus",
                    orderId: p.orderId || p.address || p.flowId || null,
                    createdAt: new Date(),
                });
            } catch (err) {
                console.error("[BrainBus] Failed to forward incident to eventStreamService:", err.message);
            }
        });
        console.log("[BrainBus] ✓ Operator subscriber wired (forwarding to eventStreamService)");
    } catch (e) {
        console.warn("[BrainBus] ⚠ Operator not available:", e.message);
    }

    // ── Knowledge Bridge (rules + pipelines → Live Memory) ────────────
    try {
        const { default: knowledgeBridge } = await import("./knowledgeBridge.js");
        await knowledgeBridge.start();
        console.log("[BrainBus] ✓ Knowledge Bridge wired");
    } catch (e) {
        console.warn("[BrainBus] ⚠ Knowledge Bridge not available:", e.message);
    }

    // ── Decision Engine (verdicts + incidents → decisions + actions) ──
    try {
        const { default: decisionEngine } = await import("./decisionEngine.js");
        decisionEngine.start();
        console.log("[BrainBus] ✓ Decision Engine wired");
    } catch (e) {
        console.warn("[BrainBus] ⚠ Decision Engine not available:", e.message);
    }

    // ── Human Explanations (decisions → audit trail + SSE + console) ──
    try {
        const { default: explanationEngine } = await import("./explanationEngine.js");
        await explanationEngine.start();
        console.log("[BrainBus] ✓ Explanation Engine wired");
    } catch (e) {
        console.warn("[BrainBus] ⚠ Explanation Engine not available:", e.message);
    }

    // ── Live Memory ────────────────────────────────────────────────────
    try {
        const { default: liveMemory } = await import("./liveMemory.js");
        liveMemory.start();
        console.log("[BrainBus] ✓ Live Memory subscriber wired");

    // ── Predictions: Anomaly Detection ──────────────────────────────────
    try {
        const { default: anomalyDetector } = await import("./predictions/anomalyDetector.js");
        anomalyDetector.start();
        console.log("[BrainBus] ✓ Anomaly Detector wired");
    } catch (e) {
        console.warn("[BrainBus] ⚠ Anomaly Detector not available:", e.message);
    }

    // ── Predictions: Incident Correlation ──────────────────────────────
    try {
        const { default: correlationEngine } = await import("./predictions/correlationEngine.js");
        correlationEngine.start();
        console.log("[BrainBus] ✓ Correlation Engine wired");

    // ── Swap Flow Bridge (FlowerOrder → Inspector sync) ──────────────────
    try {
        const { default: swapFlowBridge } = await import("./predictions/swapFlowBridge.js");
        await swapFlowBridge.start();
        console.log("[BrainBus] ✓ Swap Flow Bridge wired");
    } catch (e) {
        console.warn("[BrainBus] ⚠ Swap Flow Bridge not available:", e.message);
    }
    } catch (e) {
        console.warn("[BrainBus] ⚠ Correlation Engine not available:", e.message);
    }
    } catch (e) {
        console.warn("[BrainBus] ⚠ Live Memory not available:", e.message);
    }

    if (process.env.BRAINBUS_DEBUG === "1") {
        brainBus.on("*", (envelope) => {
            console.log(`[BrainBus] 🔄 ${envelope.channel}  ← ${envelope.meta.source}  (corr: ${envelope.meta.correlationId || "none"})`);
        });
    }

    console.log("[BrainBus] ✅ All subscribers wired");
    brainBus.dump();
}

export default wireBrainBus;
