import { Router } from "express";
import { requireAuth, requireAdmin } from "../../auth/middleware/authMiddleware.js";
import operatorActions from "../../brainbus/predictions/operatorActions.js";
import anomalyDetector from "../../brainbus/predictions/anomalyDetector.js";
import correlationEngine from "../../brainbus/predictions/correlationEngine.js";
import liveMemoryStore from "../../brainbus/liveMemoryStore.js";
import FlowerOrder from "../../models/flower/flowerOrderModel.js";
import BlockchainInbox from "../../models/blockchain/blockchainInboxModel.js";
import { buildStageTimeline } from "../../intelligence/stageTimeline.js";
import { explainFailure } from "../../intelligence/rootCauseClassifier.js";

const router = Router();

// ── Get actionable items ────────────────────────────────────────────────
router.get("/actionable", requireAuth, requireAdmin, async (req, res) => {
    try {
        const data = operatorActions.getActionableIncidents();
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Resolve / Retry / Escalate ──────────────────────────────────────────
router.post("/resolve", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { incidentId, resolution } = req.body;
        const result = await operatorActions.resolveIncident(incidentId, resolution);
        res.json({ success: true, data: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post("/retry", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { flowId, stage } = req.body;
        const result = await operatorActions.retryFlow(flowId, stage);
        res.json({ success: true, data: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post("/escalate", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { flowId, note } = req.body;
        const result = await operatorActions.escalateFlow(flowId, note);
        res.json({ success: true, data: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Predictions ─────────────────────────────────────────────────────────
router.get("/predictions", requireAuth, requireAdmin, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                stageStats: anomalyDetector.getStats(),
                incidentClusters: correlationEngine.getClusters(),
                memoryStats: liveMemoryStore.getStats(),
                activeFlows: liveMemoryStore.getActiveFlowCount(),
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Intelligence for a specific flow/order ──────────────────────────────
router.get("/intelligence/:flowId", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { flowId } = req.params;
        const store = liveMemoryStore;

        const flow = store.getFlow(flowId);
        const decisions = [...store._decisions?.values() || []]
            .filter(d => d.flowId === flowId || d.orderId === flowId).slice(-5);
        const incidents = [...store._incidents?.values() || []]
            .filter(i => i.flowId === flowId).slice(-5);
        const anomalyStats = anomalyDetector.getStats();
        const pipelineKey = flow?.pipeline ? Object.keys(anomalyStats).find(k => k.startsWith(flow.pipeline)) : null;
        const stageStats = pipelineKey ? anomalyStats[pipelineKey] : null;

        const trace = await getTrace(flowId);
        const suggestion = await getSuggestion(flowId, flow, stageStats);

        // NEW: root-cause classification + full stage timeline. Prefer the
        // live Inspector flow's stages[] (has real per-stage error text via
        // failStage()); fall back to the FlowerOrder's single failureReason
        // field when no Inspector doc is cached yet, so this still works
        // for orders that failed before swapFlowBridge synced them.
        const { rootCause, timeline } = await getRootCause(flowId, flow);

        res.json({
            success: true,
            data: {
                flowId,
                flow: flow ? { pipeline: flow.pipeline, status: flow.status, stages: flow.stages } : null,
                decisions: decisions.map(d => ({ decisionId: d.decisionId, tier: d.tier, verdict: d.verdict, action: d.action, reason: d.reason, status: d.status, timestamp: d.timestamp })),
                incidents: incidents.map(i => ({ type: i.type, severity: i.severity, diagnosis: i.diagnosis, recommendation: i.recommendation, timestamp: i.createdAt || i.timestamp })),
                stageStats,
                suggestion,
                trace,
                rootCause,
                timeline,
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Root cause: classify the failure + show which downstream stages ─────
// never ran as a result. Returns { rootCause: null, timeline: null } for
// flows that haven't failed — the frontend should only render the badge
// when rootCause is present.
async function getRootCause(flowId, cachedFlow) {
    try {
        // Case 1: we have a live Inspector flow with real stage-level errors.
        if (cachedFlow?.pipeline && cachedFlow.status === "FAILED") {
            const timeline = buildStageTimeline(cachedFlow.pipeline, cachedFlow.stages || [], cachedFlow.status);
            const failedStage = (cachedFlow.stages || []).find(s => s.status === "FAILED");
            if (failedStage) {
                const rootCause = explainFailure(timeline, failedStage.name, failedStage.error || "");
                return { rootCause, timeline };
            }
        }

        // Case 2: fall back to FlowerOrder — most swap failures in the wild
        // right now live here, not in a synced Inspector doc.
        const order = await FlowerOrder.findOne({ orderId: flowId }).lean();
        if (!order?.status?.startsWith("FAILED")) return { rootCause: null, timeline: null };

        const timeline = buildStageTimeline(
            "FLOWER_SWAP",
            // Reconstruct a minimal observed-stages list from what FlowerOrder tracks directly.
            [
                order.sweepTxHash ? { name: "FLOWER_SWEEP", status: "SUCCESS" } : null,
                order.swapTxHash ? { name: "FLOWER_SWAP", status: "SUCCESS" } : null,
                { name: order.status.replace("FAILED_", "FLOWER_") || "FLOWER_SWEEP", status: "FAILED" },
            ].filter(Boolean),
            "FAILED"
        );
        const failedStageName = order.status.replace("FAILED_", "FLOWER_");
        const rootCause = explainFailure(timeline, failedStageName, order.failureReason || order.status);
        return { rootCause, timeline };
    } catch (e) {
        return { rootCause: null, timeline: null };
    }
}

// ── Trace: user action → backend received → backend processed → result ──
async function getTrace(flowId) {
    try {
        const order = await FlowerOrder.findOne({ orderId: flowId }).lean();
        if (!order) return null;

        const trace = {
            userAction: {
                action: "Swap order created",
                timestamp: order.createdAt,
                details: `${order.expectedAmount || '?'} ${order.direction || 'FLOWER_TO_USDC'}`,
                depositAddress: order.depositAddress,
            },
            backendReceived: {
                action: "Order stored in database",
                status: order.status,
                currentStage: order.currentStage || 'not set',
                timestamp: order.createdAt,
            },
            backendProcessed: null,
            result: null,
        };

        if (order.depositAddress) {
            const deposit = await BlockchainInbox.findOne({
                toAddress: order.depositAddress.toLowerCase(),
            }).sort({ createdAt: -1 }).lean();

            trace.backendProcessed = deposit ? {
                action: "✅ Deposit detected on-chain",
                txHash: deposit.txHash,
                amount: deposit.amount,
                status: deposit.status,
                timestamp: deposit.createdAt,
            } : {
                action: "⏳ Awaiting on-chain deposit",
                status: "PENDING",
                message: `Watching ${order.depositAddress?.slice(0,10)}... — sweeper runs every batch cycle.`,
            };
        }

        const ageMin = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);
        if (order.status === "COMPLETED") {
            trace.result = { action: "✅ Swap completed", txHash: order.swapTxHash };
        } else if (order.status?.startsWith("FAILED")) {
            trace.result = { action: "❌ Swap failed", stage: order.status, attempts: order.sweepAttempts || 0 };
        } else if (order.status === "WAITING_DEPOSIT") {
            trace.result = ageMin > 60
                ? { action: "⚠ Stalled", message: `No deposit for ${Math.round(ageMin/60)}h. Cancel and retry.` }
                : { action: "⏳ Awaiting deposit", message: `Send ${order.expectedAmount} FLOWER to ${order.depositAddress?.slice(0,10)}...` };
        } else {
            trace.result = { action: order.status, stage: order.currentStage };
        }

        return trace;
    } catch (e) { return null; }
}

// ── Suggestion ──────────────────────────────────────────────────────────
async function getSuggestion(flowId, cachedFlow, stageStats) {
    if (cachedFlow) {
        if (cachedFlow.status === "FAILED" || cachedFlow.status?.startsWith("FAILED"))
            return stageStats?.failureRate
                ? `Stage has ${stageStats.failureRate} failure rate (${stageStats.failures}/${stageStats.total}). Retry to re-attempt.`
                : "Flow failed. Click Retry to re-attempt.";
        if (cachedFlow.status === "RUNNING")
            return "Flow in progress. Monitor live log for updates.";
    }

    try {
        const order = await FlowerOrder.findOne({ orderId: flowId }).lean();
        if (!order) return null;

        if (order.status === "WAITING_DEPOSIT" || order.status === "CREATED") {
            const deposit = await BlockchainInbox.findOne({
                toAddress: order.depositAddress?.toLowerCase(),
                status: "CONFIRMED",
            }).sort({ createdAt: -1 }).lean();

            if (deposit) return `✅ Deposit found! ${deposit.amount} FLOWER at ${order.depositAddress?.slice(0,10)}... Sweeper will process shortly.`;

            const ageMin = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);
            return ageMin > 60
                ? `⚠ No deposit for ${Math.round(ageMin/60)}h. Send ${order.expectedAmount} FLOWER to ${order.depositAddress?.slice(0,10)}... or cancel and create new order.`
                : `⏳ Awaiting deposit of ${order.expectedAmount} FLOWER to ${order.depositAddress?.slice(0,10)}...`;
        }

        if (order.status === "COMPLETED") return "✅ Swap completed successfully.";
        if (order.status?.startsWith("FAILED")) return `Failed at ${order.status.replace("FAILED_", "")}. Retry to re-attempt.`;
        return `Status: ${order.status}. Stage: ${order.currentStage || 'unknown'}.`;
    } catch (e) { return null; }
}

export default router;
