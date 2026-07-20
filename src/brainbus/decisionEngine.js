// src/brainbus/decisionEngine.js
// ────────────────────────────────────────────────────────────────────────────
// ISCAN Decision Engine
//
// Subscribes to reasoning.verdict on BrainBus and decides what action to
// take.  This is the central "what do we do about this?" component.
//
// Decision tiers:
//   AUTO     — safe, reversible, no human needed (e.g. retry a known flake)
//   SUGGEST  — operator should review but system can proceed
//   ESCALATE — requires human intervention before further action
//   BLOCK    — stop all processing for this flow until resolved
//
// Once a decision is made, it emits decision.dispatched.  The Intelligent
// Operator picks up AUTO decisions and executes them.  SUGGEST/ESCALATE
// go to the dashboard.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";
import liveMemoryStore from "./liveMemoryStore.js";

class DecisionEngine {

    constructor() {
        // Which verdicts map to which decision tiers
        this._verdictMap = {
            "COMPLETE":            { tier: "AUTO",     action: "close_flow",        reason: "Flow completed successfully." },
            "IN_PROGRESS":         { tier: "AUTO",     action: "continue_monitor",  reason: "Flow on track." },
            "TERMINATED":          { tier: "AUTO",     action: "close_flow",        reason: "Flow reached terminal exit." },
            "STALLED":             { tier: "ESCALATE", action: "investigate_stall",  reason: "Flow stalled — no stage activity." },
            "GAP_DETECTED":        { tier: "SUGGEST",  action: "fill_gap",          reason: "Stage sequence gap detected." },
            "FAILED_AT_STAGE":     { tier: "ESCALATE", action: "investigate_failure", reason: "Flow failed at a stage." },
            "UNKNOWN_PIPELINE":    { tier: "ESCALATE", action: "define_pipeline",   reason: "No pipeline definition found." },
            "UNKNOWN":             { tier: "SUGGEST",  action: "manual_review",     reason: "Reasoning engine could not determine state." }
        };

        // Auto-remediation whitelist — codes from knowledgeBase that are
        // safe to retry without human approval.
        this._autoRemediationCodes = new Set([
            "RPC_TIMEOUT",
            "RPC_UNAVAILABLE",
            "FORWARDER_TRANSFER_FAILED"
        ]);
    }

    start() {

        // ── Reasoning verdicts → decisions ──────────────────────────────
        brainBus.on(Channels.REASONING_VERDICT, (envelope) => {
            const { flowId, pipeline, verdict, message, details } = envelope.payload;
            const mapping = this._verdictMap[verdict] || this._verdictMap["UNKNOWN"];

            const decision = {
                decisionId: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                flowId,
                pipeline,
                verdict,
                message,
                tier: mapping.tier,
                action: mapping.action,
                reason: mapping.reason,
                timestamp: new Date().toISOString(),
                status: "DISPATCHED"
            };

            // Store in Live Memory
            liveMemoryStore.setDecision(decision.decisionId, decision);

            // Emit on bus
            brainBus.emit(Channels.DECISION_DISPATCHED, decision, {
                source: "DecisionEngine",
                correlationId: flowId
            });

            // Route based on tier
            switch (decision.tier) {
                case "AUTO":
                    // Auto-executable — the operator subscriber will pick this up
                    brainBus.emit(Channels.ACTION_EXECUTED, {
                        decisionId: decision.decisionId,
                        flowId,
                        action: decision.action,
                        result: "queued_for_operator"
                    }, { source: "DecisionEngine", correlationId: flowId });
                    break;

                case "SUGGEST":
                case "ESCALATE":
                    // Human needs to see this — emit explanation event
                    brainBus.emit(Channels.EXPLANATION_GENERATED, {
                        decisionId: decision.decisionId,
                        flowId,
                        pipeline,
                        verdict,
                        tier: decision.tier,
                        message: decision.reason,
                        action: decision.action,
                        recommendation: mapping.tier === "ESCALATE"
                            ? "⚠ Immediate operator review required."
                            : "ℹ Review recommended at next available opportunity."
                    }, { source: "DecisionEngine", correlationId: flowId });
                    break;

                case "BLOCK":
                    brainBus.emit(Channels.DECISION_FAILED, {
                        decisionId: decision.decisionId,
                        flowId,
                        reason: "Flow blocked — requires human intervention."
                    }, { source: "DecisionEngine", correlationId: flowId });
                    break;
            }
        });

        // ── Operator incidents → decisions ──────────────────────────────
        brainBus.on(Channels.OPERATOR_INCIDENT, (envelope) => {
            const { flowId, type, severity, diagnosis, code } = envelope.payload;

            // Check if this incident code is whitelisted for auto-remediation
            const autoRemediate = code && this._autoRemediationCodes.has(code);

            const decision = {
                decisionId: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                flowId,
                incidentType: type,
                severity,
                diagnosis,
                code,
                tier: autoRemediate ? "AUTO" : "ESCALATE",
                action: autoRemediate ? "auto_remediate" : "investigate_incident",
                reason: autoRemediate
                    ? `Code "${code}" is whitelisted for auto-remediation.`
                    : `Incident "${type}" requires operator investigation.`,
                timestamp: new Date().toISOString(),
                status: "DISPATCHED"
            };

            liveMemoryStore.setDecision(decision.decisionId, decision);

            brainBus.emit(Channels.DECISION_DISPATCHED, decision, {
                source: "DecisionEngine",
                correlationId: flowId || envelope.meta.correlationId
            });

            if (autoRemediate) {
                brainBus.emit(Channels.ACTION_EXECUTED, {
                    decisionId: decision.decisionId,
                    flowId,
                    action: "auto_remediate",
                    code,
                    result: "queued_for_operator"
                }, { source: "DecisionEngine", correlationId: flowId });
            } else {
                brainBus.emit(Channels.EXPLANATION_GENERATED, {
                    decisionId: decision.decisionId,
                    flowId,
                    incidentType: type,
                    severity,
                    tier: "ESCALATE",
                    message: diagnosis,
                    recommendation: "⚠ Operator review required."
                }, { source: "DecisionEngine", correlationId: flowId });
            }
        });

        console.log("[DecisionEngine] ✅ Listening on reasoning.verdict + operator.incident — dispatching decisions");
    }
}

const decisionEngine = new DecisionEngine();
export default decisionEngine;
