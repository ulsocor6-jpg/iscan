// src/brainbus/knowledgeBridge.js
// ────────────────────────────────────────────────────────────────────────────
// Loads the operator knowledgeBase rules into Live Memory at boot so the
// reasoning engine and decision engine can query rules without importing
// operator services directly.
//
// Also listens for knowledge.lookup events on BrainBus and responds with
// matching rules.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";
import liveMemoryStore from "./liveMemoryStore.js";

class KnowledgeBridge {

    async start() {
        // ── Load operator knowledge base into Live Memory ────────────────
        try {
            const { default: knowledgeBase } = await import("../services/operator/knowledgeBase.js");
            liveMemoryStore.loadKnowledgeRules(knowledgeBase);
            console.log(`[KnowledgeBridge] Loaded ${knowledgeBase.length} operational rules into Live Memory`);
        } catch (e) {
            console.warn("[KnowledgeBridge] ⚠ Could not load knowledgeBase:", e.message);
        }

        // ── Load pipeline definitions into Live Memory ──────────────────
        try {
            const { default: systemKnowledge } = await import("../intelligence/systemKnowledge.js");
            // Convert pipeline definitions to rule-like objects for the store
            const pipelineRules = [];
            for (const [name, def] of Object.entries(systemKnowledge.pipelines)) {
                pipelineRules.push({
                    id: `pipeline:${name}`,
                    type: "pipeline",
                    name,
                    description: def.description,
                    entryStages: def.entryStages,
                    stages: def.stages,
                    terminalExits: def.terminalExits
                });
            }
            liveMemoryStore.loadKnowledgeRules(pipelineRules);
            console.log(`[KnowledgeBridge] Loaded ${pipelineRules.length} pipeline definitions into Live Memory`);
        } catch (e) {
            console.warn("[KnowledgeBridge] ⚠ Could not load systemKnowledge:", e.message);
        }

        // ── Listen for knowledge lookups on the bus ─────────────────────
        brainBus.on(Channels.KNOWLEDGE_LOOKUP, (envelope) => {
            const { ruleId, pipeline, event } = envelope.payload;

            if (ruleId) {
                const rule = liveMemoryStore.getKnowledgeRule(ruleId);
                if (rule) {
                    brainBus.emit(Channels.KNOWLEDGE_RULE_MATCHED, {
                        query: { ruleId },
                        rule,
                        timestamp: new Date().toISOString()
                    }, { source: "KnowledgeBridge", correlationId: envelope.meta.correlationId });
                }
            }

            if (pipeline) {
                const pipelineRule = liveMemoryStore.getKnowledgeRule(`pipeline:${pipeline}`);
                if (pipelineRule) {
                    brainBus.emit(Channels.KNOWLEDGE_RULE_MATCHED, {
                        query: { pipeline },
                        rule: pipelineRule,
                        timestamp: new Date().toISOString()
                    }, { source: "KnowledgeBridge", correlationId: envelope.meta.correlationId });
                }
            }
        });

        console.log("[KnowledgeBridge] ✅ Ready — rules cached, listening for knowledge.lookup");
    }
}

const knowledgeBridge = new KnowledgeBridge();
export default knowledgeBridge;
