// src/brainbus/predictions/swapFlowBridge.js
// ────────────────────────────────────────────────────────────────────────────
// Bridges FlowerOrder swap flows into the Inspector model so the Pipeline
// Inspector health check and the Operator dashboard can see them.
//
// Listens for INSPECTOR_FLOW_STARTED and INSPECTOR_FLOW_STAGE events on
// BrainBus from flowerStageHandlers.js and ensures an Inspector document
// exists for each swap flow.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "../brainBus.js";
import { Channels } from "../channels.js";
import liveMemoryStore from "../liveMemoryStore.js";

class SwapFlowBridge {
    constructor() {
        this._started = false;
        // Track which swap flows we've already created Inspector docs for
        this._syncedFlows = new Set();
    }

    async start() {
        if (this._started) return;
        this._started = true;

        brainBus.on(Channels.INSPECTOR_FLOW_STARTED, async (envelope) => {
            const flow = envelope.payload;
            if (flow.pipeline !== "FLOWER_SWAP") return;
            if (this._syncedFlows.has(flow.flowId)) return;

            try {
                const { default: Inspector } = await import("../../models/inspectorModel.js");

                // Upsert — don't duplicate if somehow already exists
                await Inspector.findOneAndUpdate(
                    { flowId: flow.flowId },
                    {
                        $setOnInsert: {
                            flowId: flow.flowId,
                            pipeline: "FLOWER_SWAP",
                            source: flow.source || "FLOWER",
                            transactionType: "swap",
                            amount: flow.amount,
                            currency: flow.currency || "USDC",
                            status: "RUNNING",
                            stages: [],
                        }
                    },
                    { upsert: true, new: true }
                );

                this._syncedFlows.add(flow.flowId);
                console.log(`[SwapFlowBridge] Synced swap flow ${flow.flowId} to Inspector`);
            } catch (e) {
                console.error("[SwapFlowBridge] Failed to sync flow:", e.message);
            }
        });

        brainBus.on(Channels.INSPECTOR_FLOW_STAGE, async (envelope) => {
            const { flowId, stage, data } = envelope.payload;
            if (!this._syncedFlows.has(flowId)) {
                // Check if it's a swap flow by looking at Live Memory
                const cached = liveMemoryStore.getFlow(flowId);
                if (!cached || cached.pipeline !== "FLOWER_SWAP") return;
                this._syncedFlows.add(flowId);
            }

            try {
                const { default: Inspector } = await import("../../models/inspectorModel.js");

                // Push the stage or update existing
                const flow = await Inspector.findOne({ flowId });
                if (!flow) return;

                const existingStage = flow.stages?.find(s => s.name === stage);
                if (existingStage) {
                    existingStage.status = data.status || "SUCCESS";
                    existingStage.finishedAt = new Date();
                    if (data.txHash) existingStage.output = { txHash: data.txHash };
                } else {
                    flow.stages.push({
                        name: stage,
                        status: data.status || "SUCCESS",
                        startedAt: new Date(),
                        finishedAt: data.status === "SUCCESS" ? new Date() : undefined,
                        output: data.txHash ? { txHash: data.txHash } : undefined,
                    });
                }

                if (data.status === "FAILED") {
                    flow.status = "FAILED";
                }

                await flow.save();
            } catch (e) {
                console.error("[SwapFlowBridge] Failed to sync stage:", e.message);
            }
        });

        brainBus.on(Channels.INSPECTOR_FLOW_COMPLETED, async (envelope) => {
            const { flowId, result } = envelope.payload;
            if (!this._syncedFlows.has(flowId)) return;

            try {
                const { default: Inspector } = await import("../../models/inspectorModel.js");
                await Inspector.findOneAndUpdate(
                    { flowId },
                    { status: result?.status === "SUCCESS" ? "SUCCESS" : "FAILED" }
                );
                console.log(`[SwapFlowBridge] Flow ${flowId} completed: ${result?.status}`);
            } catch (e) {
                console.error("[SwapFlowBridge] Failed to complete flow:", e.message);
            }
        });

        console.log("[SwapFlowBridge] ✅ Bridging swap flows into Inspector model");
    }
}

const swapFlowBridge = new SwapFlowBridge();
export default swapFlowBridge;
