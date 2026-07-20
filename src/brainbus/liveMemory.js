// src/brainbus/liveMemory.js
// ────────────────────────────────────────────────────────────────────────────
// Live Memory — subscribes to BrainBus and keeps the in-process state store
// hydrated.  This is the "write path" for Live Memory.
//
// Any component can also call liveMemoryStore directly for reads (the
// "read path"), avoiding MongoDB round-trips for hot data.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";
import liveMemoryStore from "./liveMemoryStore.js";

class LiveMemory {
    constructor() {
        this._started = false;
    }

    start() {
        if (this._started) return;
        this._started = true;

        // ── Inspector flows ─────────────────────────────────────────────
        brainBus.on(Channels.INSPECTOR_FLOW_STARTED, (envelope) => {
            const flow = envelope.payload;
            liveMemoryStore.setFlow(flow.flowId, flow);
        });

        brainBus.on(Channels.INSPECTOR_FLOW_STAGE, (envelope) => {
            const { flowId, stage, data } = envelope.payload;
            liveMemoryStore.updateFlowStage(flowId, stage, data);
        });

        brainBus.on(Channels.INSPECTOR_FLOW_COMPLETED, (envelope) => {
            const { flowId, result } = envelope.payload;
            liveMemoryStore.updateFlowStage(flowId, "_COMPLETED", { result, status: "SUCCESS" });
        });

        // ── Blockchain events ───────────────────────────────────────────
        brainBus.on(Channels.BLOCKCHAIN_EVENT, (envelope) => {
            const event = envelope.payload;
            liveMemoryStore.setBlockchainEvent(event.txHash, event);
        });

        // ── Knowledge rules ─────────────────────────────────────────────
        brainBus.on(Channels.KNOWLEDGE_RULE_MATCHED, (envelope) => {
            // Cache the matched rule for faster future lookups.
            if (envelope.payload.rule) {
                liveMemoryStore.loadKnowledgeRules([envelope.payload.rule]);
            }
        });

        // ── Decisions ───────────────────────────────────────────────────
        brainBus.on(Channels.DECISION_DISPATCHED, (envelope) => {
            liveMemoryStore.setDecision(envelope.meta.correlationId, envelope.payload);
        });

        brainBus.on(Channels.DECISION_EXECUTED, (envelope) => {
            const decisionId = envelope.meta.correlationId;
            const existing = liveMemoryStore.getDecision(decisionId);
            if (existing) {
                liveMemoryStore.setDecision(decisionId, {
                    ...existing,
                    status: "EXECUTED",
                    result: envelope.payload,
                    executedAt: new Date().toISOString()
                });
            }
        });

        // ── Incidents ───────────────────────────────────────────────────
        brainBus.on(Channels.OPERATOR_INCIDENT, (envelope) => {
            const incidentId = envelope.meta.correlationId || `incident-${Date.now()}`;
            liveMemoryStore.setIncident(incidentId, {
                ...envelope.payload,
                status: "open",
                createdAt: new Date().toISOString()
            });
        });

        // ── Health reporting ────────────────────────────────────────────
        setInterval(() => {
            const stats = liveMemoryStore.getStats();
            brainBus.emit(Channels.SYSTEM_HEALTH, {
                node: "LiveMemory",
                status: "ONLINE",
                metrics: stats
            }, { source: "LiveMemory" });
        }, 30000); // every 30 seconds

        console.log("[LiveMemory] ✅ Subscribed to BrainBus — caching active flows, events, decisions, incidents");
    }
}

// Singleton
const liveMemory = new LiveMemory();
export default liveMemory;
