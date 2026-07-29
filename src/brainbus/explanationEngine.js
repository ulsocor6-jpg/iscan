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
import PendingOperation from "../models/blockchain/pendingOperationModel.js";
import inspectorService from "../services/inspectorService.js";

class ExplanationEngine {

    constructor() {
        this._explanationCount = 0;
        // Map of reason patterns to human‑friendly explanations
        this._reasonMap = {
            "Signature verification failed": {
                summary: (ctx) => `The deposit notification signature was invalid – the Android app may have used the wrong secret or the payload was tampered with.`,
                recommendation: (ctx) => `Check that the Android app is using the correct depositSecret for operation ${ctx.operationId || 'N/A'}. Verify that the secret is still valid and has not expired.`
            },
            "Amount verification failed": {
                summary: (ctx) => `The reported amount (${ctx.amount || 'unknown'}) does not match the expected ${ctx.expectedAmount || 'unknown'} ${ctx.asset || 'PHP'} for operation ${ctx.operationId || 'N/A'}.`,
                recommendation: (ctx) => `Verify the actual deposit amount and ask the user to confirm. If correct, adjust the tolerance or create a new operation with the correct expected amount.`
            },
            "Duplicate reference": {
                summary: (ctx) => `This reference has already been processed – likely a duplicate notification.`,
                recommendation: (ctx) => `No action needed – this is a duplicate. If the user claims they sent multiple deposits, check the pending operations.`
            },
            "Pending operation mismatch": {
                summary: (ctx) => `The operation ${ctx.operationId || 'N/A'} does not match the incoming deposit (user, amount, or asset mismatch).`,
                recommendation: (ctx) => `Investigate the mismatch: verify the user ID, expected amount, and asset. The user may need to create a new deposit request.`
            },
            "Expired operation": {
                summary: (ctx) => `Operation ${ctx.operationId || 'N/A'} expired at ${ctx.expiration || 'unknown'}.`,
                recommendation: (ctx) => `The user must create a new deposit request. The previous operation has expired.`
            },
            "Operation not found": {
                summary: (ctx) => `No pending deposit operation found for the provided operationId: ${ctx.operationId || 'N/A'}.`,
                recommendation: (ctx) => `The operationId sent by the app does not exist. Ask the user to cancel and re‑initiate the deposit.`
            },
            "No matching pending operation": {
                summary: (ctx) => `Could not find a pending deposit request for user ${ctx.userId || 'unknown'} with amount ${ctx.amount || 'unknown'} within tolerance.`,
                recommendation: (ctx) => `Check if the user has an active pending deposit request. If not, ask the user to initiate a new deposit.`
            }
        };
    }

    async start() {

        // ── Decision-triggered explanations ─────────────────────────────
        brainBus.on(Channels.EXPLANATION_GENERATED, async (envelope) => {
            const explanation = this._buildExplanation(envelope);
            await this._persist(explanation);
            this._render(explanation);
        });

        // ── Enhanced operator incident handler ─────────────────────────
        brainBus.on(Channels.OPERATOR_INCIDENT, async (envelope) => {
            const payload = envelope.payload;

            // Only handle if it didn't come from DecisionEngine (avoid duplicates)
            if (!payload.decisionId) {
                // Fetch context (flow + pending operation)
                const context = await this._fetchContext(payload.flowId, payload.userId, payload.source);

                // Interpret the incident using context
                const interpretation = this._interpretIncident(payload, context);

                const explanation = {
                    id: `expl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    timestamp: new Date().toISOString(),
                    source: "OperatorIncident",
                    flowId: payload.flowId || null,
                    tier: payload.severity === "high" || payload.severity === "CRITICAL" ? "ESCALATE" : "SUGGEST",
                    title: interpretation.title,
                    summary: interpretation.summary,
                    recommendation: interpretation.recommendation,
                    details: payload.details || payload,
                    rendered: null,
                    operationId: context.operationId || null,
                    expectedAmount: context.expectedAmount || null,
                    actualAmount: payload.amount || null,
                };

                await this._persist(explanation);
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
       Fetch context (flow + pending operation) for richer explanations
       ------------------------------------------------------------------ */

    async _fetchContext(flowId, userId, source) {
        let flow = null;
        let pendingOp = null;
        let operationId = null;
        let expectedAmount = null;
        let expiration = null;

        try {
            if (flowId) {
                flow = await inspectorService.getFlow(flowId);
                if (flow && flow.operationId) {
                    operationId = flow.operationId;
                    pendingOp = await PendingOperation.findOne({ operationId }).select('+depositSecret');
                }
            }
            if (!pendingOp && userId) {
                // Try to find the most recent pending operation for this user
                pendingOp = await PendingOperation.findOne({
                    userId,
                    status: 'PENDING',
                    asset: 'PHP',
                    expiration: { $gt: new Date() }
                }).sort({ createdAt: -1 }).select('+depositSecret');
                if (pendingOp) {
                    operationId = pendingOp.operationId;
                }
            }
            if (pendingOp) {
                expectedAmount = pendingOp.expectedAmount;
                expiration = pendingOp.expiration;
            }
        } catch (e) {
            // ignore – best effort
        }

        return { flow, pendingOp, operationId, expectedAmount, expiration };
    }

    /* ------------------------------------------------------------------
       Interpret an incident and produce a human‑readable explanation
       ------------------------------------------------------------------ */

    _interpretIncident(payload, context) {
        const { reason, details, source, userId, amount } = payload;
        const ctx = {
            userId,
            amount,
            operationId: context.operationId,
            expectedAmount: context.expectedAmount,
            expiration: context.expiration,
            asset: 'PHP',
            source: source || 'unknown'
        };

        let summary, recommendation, title;

        // Find matching reason in map
        const matchedKey = Object.keys(this._reasonMap).find(key => reason && reason.includes(key));
        if (matchedKey) {
            const entry = this._reasonMap[matchedKey];
            summary = entry.summary(ctx);
            recommendation = entry.recommendation(ctx);
            title = `❌ ${matchedKey}`;
        } else {
            // Generic fallback
            summary = `${source} deposit failed: ${reason || 'unknown error'}. Operation: ${ctx.operationId || 'N/A'}.`;
            recommendation = `Investigate the system logs for more details. Consider manual review if the issue persists.`;
            title = `⚠️ Deposit Verification Failed`;
        }

        // Add details if present
        if (details) {
            summary += ` Details: ${JSON.stringify(details)}.`;
        }

        return { title, summary, recommendation };
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
                    explanationId: explanation.id,
                    operationId: explanation.operationId,
                    expectedAmount: explanation.expectedAmount,
                    actualAmount: explanation.actualAmount,
                },
                status: explanation.tier === "ESCALATE" ? "failed" : "success"
            });
        } catch (e) {
            if (e.code !== "MODULE_NOT_FOUND") {
                console.error("[ExplanationEngine] Failed to write audit record:", e.message);
            }
        }

        // ── Event stream broadcast ──────────────────────────────────────
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
            // Non-fatal
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
        if (explanation.operationId) {
            console.log(`  Operation: ${explanation.operationId}`);
        }
        if (explanation.expectedAmount) {
            console.log(`  Expected:  ${explanation.expectedAmount} PHP`);
        }
        if (explanation.actualAmount) {
            console.log(`  Actual:    ${explanation.actualAmount} PHP`);
        }
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
