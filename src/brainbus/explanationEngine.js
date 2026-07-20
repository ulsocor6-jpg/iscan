// src/brainbus/explanationEngine.js
// ────────────────────────────────────────────────────────────────────────────
// Human Explanations Engine
//
// Listens for explanation.generated events on BrainBus and produces
// structured, human-readable audit records.  This is the "explainability
// layer" — every decision that needs human understanding flows through here.
//
// Outputs:
//   1. MongoDB audit record (via existing auditModel)
//   2. Event stream broadcast (via eventStreamService — existing SSE)
//   3. Console summary (for immediate operator visibility)
//   4. Live Memory cache (for dashboard queries)
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";

class ExplanationEngine {

    constructor() {
        this._explanationCount = 0;
    }

    async start() {

        // ── Decision-triggered explanations ─────────────────────────────
        brainBus.on(Channels.EXPLANATION_GENERATED, async (envelope) => {
            const explanation = this._buildExplanation(envelope);
            await this._persist(explanation);
            this._render(explanation);
        });

        // ── Also explain operator incidents directly ────────────────────
        brainBus.on(Channels.OPERATOR_INCIDENT, (envelope) => {
            // Incidents that DON'T go through Decision Engine still need explanations.
            // Decision Engine already re-emits these as explanation.generated for
            // SUGGEST/ESCALATE tiers, so this catches anything that bypasses it.
            const { flowId, type, severity, diagnosis, recommendation } = envelope.payload;

            // Only explain if it didn't already come through DecisionEngine
            // (DecisionEngine tags its explanations with decisionId)
            if (!envelope.payload.decisionId) {
                const explanation = {
                    id: `expl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    timestamp: new Date().toISOString(),
                    source: "OperatorIncident",
                    flowId: flowId || null,
                    tier: severity === "CRITICAL" ? "ESCALATE" : "SUGGEST",
                    title: type || "Unknown Incident",
                    summary: diagnosis || "No diagnosis available.",
                    recommendation: recommendation || "Review in Operator dashboard.",
                    details: envelope.payload,
                    rendered: null
                };

                this._persist(explanation);
                this._render(explanation);
            }
        });

        // ── Periodically report explanation stats ───────────────────────
        setInterval(() => {
            brainBus.emit(Channels.SYSTEM_HEALTH, {
                node: "ExplanationEngine",
                status: "ONLINE",
                metrics: {
                    explanationsGenerated: this._explanationCount
                }
            }, { source: "ExplanationEngine" });
        }, 60000);

        console.log("[ExplanationEngine] ✅ Listening on explanation.generated + operator.incident — producing human-readable audit trail");
    }

    /* ------------------------------------------------------------------
       Build a structured explanation from a bus envelope
       ------------------------------------------------------------------ */

    _buildExplanation(envelope) {
        const { decisionId, flowId, pipeline, verdict, incidentType,
                severity, tier, message, action, recommendation } = envelope.payload;

        this._explanationCount++;

        // Determine a human-readable title
        let title;
        if (verdict) {
            const titles = {
                "COMPLETE":           "✅ Flow Completed",
                "IN_PROGRESS":        "🔄 Flow In Progress",
                "TERMINATED":         "⏹ Flow Terminated",
                "STALLED":            "⏸ Flow Stalled",
                "GAP_DETECTED":       "⚠ Stage Sequence Gap",
                "FAILED_AT_STAGE":    "❌ Flow Failed",
                "UNKNOWN_PIPELINE":   "❓ Unknown Pipeline",
                "UNKNOWN":            "❓ Unknown State"
            };
            title = titles[verdict] || `Decision: ${verdict}`;
        } else if (incidentType) {
            title = `🚨 Incident: ${incidentType}`;
        } else {
            title = "ℹ System Explanation";
        }

        // Build a plain-English summary
        let summary = message || "No additional details.";

        // Build a structured recommendation
        const rec = recommendation || this._defaultRecommendation(tier);

        return {
            id: `expl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            source: "DecisionEngine",
            decisionId: decisionId || null,
            flowId: flowId || null,
            pipeline: pipeline || null,
            tier: tier || "INFO",
            verdict: verdict || null,
            title,
            summary,
            recommendation: rec,
            action: action || null,
            details: envelope.payload
        };
    }

    /* ------------------------------------------------------------------
       Persist to MongoDB and event stream
       ------------------------------------------------------------------ */

    async _persist(explanation) {
        // ── MongoDB audit record ─────────────────────────────────────────
        try {
            const { default: Audit } = await import("../models/auditModel.js");
            await Audit.create({
                action: explanation.title,
                entity: explanation.pipeline || "system",
                entityId: explanation.flowId || explanation.decisionId,
                details: {
                    tier: explanation.tier,
                    verdict: explanation.verdict,
                    summary: explanation.summary,
                    recommendation: explanation.recommendation,
                    action: explanation.action,
                    source: explanation.source,
                    explanationId: explanation.id
                },
                status: explanation.tier === "ESCALATE" ? "failed" : "success"
            });
        } catch (e) {
            // Audit model may not be available at boot — non-fatal
            if (e.code !== "MODULE_NOT_FOUND") {
                console.error("[ExplanationEngine] Failed to write audit record:", e.message);
            }
        }

        // ── Event stream broadcast (existing SSE to dashboards) ──────────
        try {
            const { default: eventStreamService } = await import("../services/eventStreamService.js");
            eventStreamService.emit("explanation.generated", {
                explanationId: explanation.id,
                title: explanation.title,
                summary: explanation.summary,
                recommendation: explanation.recommendation,
                tier: explanation.tier,
                flowId: explanation.flowId,
                timestamp: explanation.timestamp
            });
        } catch (e) {
            // Non-fatal — SSE is best-effort
        }
    }

    /* ------------------------------------------------------------------
       Console render for immediate operator visibility
       ------------------------------------------------------------------ */

    _render(explanation) {
        const divider = "─".repeat(60);
        const tierIcon = {
            "AUTO":     "🤖",
            "SUGGEST":  "💡",
            "ESCALATE": "🚨",
            "BLOCK":    "🛑",
            "INFO":     "ℹ"
        };

        console.log(`\n${divider}`);
        console.log(`${tierIcon[explanation.tier] || "ℹ"}  ${explanation.title}`);
        console.log(`${divider}`);
        console.log(`  Flow:      ${explanation.flowId || "N/A"}`);
        console.log(`  Pipeline:  ${explanation.pipeline || "N/A"}`);
        console.log(`  Tier:      ${explanation.tier}`);
        console.log(`  Summary:   ${explanation.summary}`);
        console.log(`  Action:    ${explanation.recommendation}`);
        console.log(`${divider}\n`);
    }

    /* ------------------------------------------------------------------
       Default recommendations per tier
       ------------------------------------------------------------------ */

    _defaultRecommendation(tier) {
        switch (tier) {
            case "AUTO":     return "Automatically handled — no action required.";
            case "SUGGEST":  return "Review at next available opportunity.";
            case "ESCALATE": return "⚠ Immediate operator review required.";
            case "BLOCK":    return "🛑 Flow blocked — manual intervention required.";
            default:         return "Monitor for further developments.";
        }
    }
}

const explanationEngine = new ExplanationEngine();
export default explanationEngine;
