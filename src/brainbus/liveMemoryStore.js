// src/brainbus/liveMemoryStore.js
// ────────────────────────────────────────────────────────────────────────────
// In-process state store for ISCAN Live Memory.
//
// Holds:
//   - Active flows (inspector flowId → full flow state)
//   - Recent blockchain events (txHash → event)
//   - System knowledge rule cache (ruleId → rule)
//   - Decision log (decisionId → decision + outcome)
//   - Active incidents (incidentId → incident)
//
// All writes also emit a "memory.snapshot" event onto BrainBus so
// downstream subscribers (audit, explanation, dashboard) can react.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";

class LiveMemoryStore {
    constructor() {
        // ── Primary stores ──────────────────────────────────────────────
        this._flows = new Map();          // flowId → { flowId, pipeline, status, stages, updatedAt }
        this._blockchainEvents = new Map(); // txHash → event envelope
        this._knowledgeRules = new Map();   // ruleId → rule object
        this._decisions = new Map();        // decisionId → { verdict, action, status, timestamp }
        this._incidents = new Map();        // incidentId → { type, severity, diagnosis, status }

        // ── Metadata ────────────────────────────────────────────────────
        this._stats = {
            flowsInserted: 0,
            flowsUpdated: 0,
            flowsEvicted: 0,
            eventsInserted: 0,
            decisionsInserted: 0,
            incidentsInserted: 0
        };

        // ── TTL (max entries before eviction) ───────────────────────────
        this._maxFlows = 5000;
        this._maxEvents = 2000;
        this._maxDecisions = 1000;
        this._maxIncidents = 500;

        console.log("[LiveMemory] Store initialized");
    }

    /* ------------------------------------------------------------------
       Flows
       ------------------------------------------------------------------ */

    getFlow(flowId) {
        return this._flows.get(flowId) || null;
    }

    setFlow(flowId, flowData) {
        const existed = this._flows.has(flowId);
        this._flows.set(flowId, {
            ...flowData,
            _cachedAt: new Date().toISOString()
        });

        if (existed) {
            this._stats.flowsUpdated++;
        } else {
            this._stats.flowsInserted++;
        }

        this._evictIfNeeded(this._flows, this._maxFlows, "flowsEvicted");
        this._emitSnapshot("flow", flowId, this._flows.get(flowId));
    }

    updateFlowStage(flowId, stageName, data = {}) {
        const flow = this._flows.get(flowId);
        if (!flow) return null;

        if (!flow.stages) flow.stages = [];
        const stage = flow.stages.find(s => s.name === stageName);
        if (stage) {
            Object.assign(stage, data, { _updatedAt: new Date().toISOString() });
        } else {
            flow.stages.push({ name: stageName, ...data, _addedAt: new Date().toISOString() });
        }

        flow._cachedAt = new Date().toISOString();
        this._stats.flowsUpdated++;
        this._emitSnapshot("flow", flowId, flow);
        return flow;
    }

    removeFlow(flowId) {
        this._flows.delete(flowId);
        brainBus.emit(Channels.MEMORY_SNAPSHOT, {
            entity: "flow",
            entityId: flowId,
            action: "removed"
        }, { source: "LiveMemory" });
    }

    getActiveFlowIds() {
        return [...this._flows.keys()];
    }

    getActiveFlowCount() {
        return this._flows.size;
    }

    /* ------------------------------------------------------------------
       Blockchain Events
       ------------------------------------------------------------------ */

    setBlockchainEvent(txHash, event) {
        this._blockchainEvents.set(txHash, event);
        this._stats.eventsInserted++;
        this._evictIfNeeded(this._blockchainEvents, this._maxEvents, "eventsEvicted");
    }

    getBlockchainEvent(txHash) {
        return this._blockchainEvents.get(txHash) || null;
    }

    /* ------------------------------------------------------------------
       Knowledge Rules
       ------------------------------------------------------------------ */

    loadKnowledgeRules(rules) {
        for (const rule of rules) {
            this._knowledgeRules.set(rule.id || rule.name, rule);
        }
        console.log(`[LiveMemory] Loaded ${this._knowledgeRules.size} knowledge rules`);
    }

    getKnowledgeRule(ruleId) {
        return this._knowledgeRules.get(ruleId) || null;
    }

    /* ------------------------------------------------------------------
       Decisions
       ------------------------------------------------------------------ */

    setDecision(decisionId, decision) {
        this._decisions.set(decisionId, decision);
        this._stats.decisionsInserted++;
        this._evictIfNeeded(this._decisions, this._maxDecisions, "decisionsEvicted");
        this._emitSnapshot("decision", decisionId, decision);
    }

    getDecision(decisionId) {
        return this._decisions.get(decisionId) || null;
    }

    /* ------------------------------------------------------------------
       Incidents
       ------------------------------------------------------------------ */

    setIncident(incidentId, incident) {
        this._incidents.set(incidentId, incident);
        this._stats.incidentsInserted++;
        this._evictIfNeeded(this._incidents, this._maxIncidents, "incidentsEvicted");
    }

    getIncident(incidentId) {
        return this._incidents.get(incidentId) || null;
    }

    getActiveIncidents() {
        return [...this._incidents.values()].filter(i => i.status !== "resolved");
    }

    /* ------------------------------------------------------------------
       Stats & Health
       ------------------------------------------------------------------ */

    getStats() {
        return {
            ...this._stats,
            currentFlows: this._flows.size,
            currentEvents: this._blockchainEvents.size,
            currentDecisions: this._decisions.size,
            currentIncidents: this._incidents.size,
            knowledgeRules: this._knowledgeRules.size
        };
    }

    /* ------------------------------------------------------------------
       Internal
       ------------------------------------------------------------------ */

    _emitSnapshot(entity, entityId, data) {
        brainBus.emit(Channels.MEMORY_SNAPSHOT, {
            entity,
            entityId,
            data: { ...data },
            timestamp: new Date().toISOString()
        }, { source: "LiveMemory" });
    }

    _evictIfNeeded(map, max, statKey) {
        while (map.size > max) {
            const firstKey = map.keys().next().value;
            map.delete(firstKey);
            this._stats[statKey]++;
        }
    }
}

// Singleton
const liveMemoryStore = new LiveMemoryStore();
export default liveMemoryStore;
