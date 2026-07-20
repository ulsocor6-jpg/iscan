// src/brainbus/predictions/operatorActions.js
// ────────────────────────────────────────────────────────────────────────────
// Central action dispatcher for Operator dashboard.
// Exposes: resolveIncident, retryFlow, escalateFlow, ignoreIncident
// Each action logs to OperatorAction model for full audit trail.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "../brainBus.js";
import { Channels } from "../channels.js";
import liveMemoryStore from "../liveMemoryStore.js";

class OperatorActions {
    constructor() {
        this._actions = [];
    }

    async resolveIncident(incidentId, resolution = "Resolved by operator") {
        const incident = liveMemoryStore.getIncident(incidentId);
        const result = {
            action: "resolve",
            incidentId,
            resolution,
            previousStatus: incident?.status || "unknown",
            timestamp: new Date().toISOString()
        };

        this._actions.push(result);

        brainBus.emit("operator.action.executed", {
            type: "RESOLVE",
            incidentId,
            resolution,
            timestamp: result.timestamp
        }, { source: "OperatorActions", correlationId: incidentId });

        // Persist to OperatorAction model
        try {
            const { default: OperatorAction } = await import("../../models/operatorActionModel.js");
            await OperatorAction.create({
                incidentId,
                code: incident?.type || "unknown",
                pipeline: incident?.pipeline,
                outcome: "SUCCEEDED",
                reason: resolution,
                resultStatus: "resolved",
                triggeredBy: "operator"
            });
        } catch (e) {
            console.error("[OperatorActions] Failed to persist action:", e.message);
        }

        return result;
    }

    async retryFlow(flowId, stage = null) {
        const flow = liveMemoryStore.getFlow(flowId);
        const result = {
            action: "retry",
            flowId,
            stage,
            pipeline: flow?.pipeline || "unknown",
            timestamp: new Date().toISOString()
        };

        this._actions.push(result);

        brainBus.emit("operator.action.executed", {
            type: "RETRY",
            flowId,
            stage,
            timestamp: result.timestamp
        }, { source: "OperatorActions", correlationId: flowId });

        // Re-emit the flow stage to trigger re-processing
        brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
            flowId,
            pipeline: flow?.pipeline || "unknown",
            stage: stage || "RETRY",
            data: { status: "RUNNING", retried: true }
        }, { source: "OperatorActions", correlationId: flowId });

        try {
            const { default: OperatorAction } = await import("../../models/operatorActionModel.js");
            await OperatorAction.create({
                incidentId: flowId,
                code: "RETRY",
                pipeline: flow?.pipeline,
                orderId: flowId,
                outcome: "SUCCEEDED",
                reason: `Operator retried flow${stage ? ` at stage ${stage}` : ""}`,
                resultStatus: "retried",
                triggeredBy: "operator"
            });
        } catch (e) {
            console.error("[OperatorActions] Failed to persist action:", e.message);
        }

        return result;
    }

    async escalateFlow(flowId, note = "") {
        const flow = liveMemoryStore.getFlow(flowId);
        const result = {
            action: "escalate",
            flowId,
            note,
            pipeline: flow?.pipeline || "unknown",
            timestamp: new Date().toISOString()
        };

        this._actions.push(result);

        brainBus.emit(Channels.EXPLANATION_GENERATED, {
            flowId,
            pipeline: flow?.pipeline,
            tier: "ESCALATE",
            title: "🚨 Operator Escalated",
            message: note || "Operator escalated this flow for priority review.",
            recommendation: "Immediate attention required.",
            timestamp: result.timestamp
        }, { source: "OperatorActions", correlationId: flowId });

        try {
            const { default: OperatorAction } = await import("../../models/operatorActionModel.js");
            await OperatorAction.create({
                incidentId: flowId,
                code: "ESCALATE",
                pipeline: flow?.pipeline,
                orderId: flowId,
                outcome: "SUCCEEDED",
                reason: note || "Operator escalated",
                resultStatus: "escalated",
                triggeredBy: "operator"
            });
        } catch (e) {
            console.error("[OperatorActions] Failed to persist action:", e.message);
        }

        return result;
    }

    getRecentActions(limit = 20) {
        return this._actions.slice(-limit).reverse();
    }

    getActionableIncidents() {
        const incidents = liveMemoryStore.getActiveIncidents ? liveMemoryStore.getActiveIncidents() : [];
        const flows = liveMemoryStore.getActiveFlowIds ? liveMemoryStore.getActiveFlowIds() : [];

        return {
            activeIncidents: incidents.length,
            activeFlows: flows.length,
            incidents: incidents.slice(0, 10).map(i => ({
                id: i.id || i.incidentId,
                type: i.type,
                severity: i.severity,
                diagnosis: i.diagnosis,
                flowId: i.flowId,
                timestamp: i.createdAt || i.timestamp
            })),
            recentActions: this.getRecentActions(10)
        };
    }
}

const operatorActions = new OperatorActions();
export default operatorActions;
