// src/services/operator/remediationEngine.js
//
// Auto-remediation is opt-in per incident code, not generic. Only codes
// listed in WHITELIST get an automatic action; everything else is left
// for a human, same as today. Each handler MUST check current state
// before acting (nothing here assumes the incident is still valid) and
// every attempt — success, failure, or skip — is logged to
// OperatorAction so there's a permanent record of what was checked and
// what was done.

import FlowerOrder from "../../models/flower/flowerOrderModel.js";
import OperatorAction from "../../models/operatorActionModel.js";
import { retryOrder } from "../flower/flowerOrderRecovery.js";

async function logAction({ incident, outcome, reason, checkedState, resultStatus }) {
    try {
        await OperatorAction.create({
            incidentId: incident.id,
            code: incident.code,
            orderId: incident.orderId,
            pipeline: incident.metadata?.pipeline || null,
            checkedState,
            outcome,
            reason,
            resultStatus
        });
    } catch (err) {
        console.error("[Remediation] Failed to write action log:", err.message);
    }
}

// FORWARDER_TRANSFER_FAILED — knowledgeBase's own recommendation is
// "Retry the sweep." retryOrder() already refuses to act on a COMPLETED
// order and caps itself at MAX_AUTO_ATTEMPTS internally, so this handler's
// job is just: confirm there's still something to retry, then delegate.
async function handleForwarderTransferFailed(incident) {

    if (!incident.orderId) {
        await logAction({
            incident,
            outcome: "SKIPPED",
            reason: "Incident has no orderId — cannot identify which order to retry."
        });
        return;
    }

    const order = await FlowerOrder.findOne({ orderId: incident.orderId });

    if (!order) {
        await logAction({
            incident,
            outcome: "SKIPPED",
            reason: "Order not found."
        });
        return;
    }

    const checkedState = {
        status: order.status,
        sweepAttempts: order.sweepAttempts || 0,
        swapAttempts: order.swapAttempts || 0
    };

    if (order.status === "COMPLETED") {
        await logAction({
            incident,
            outcome: "SKIPPED",
            reason: "Order already COMPLETED — no action needed.",
            checkedState
        });
        return;
    }

    if (order.status === "FAILED") {
        await logAction({
            incident,
            outcome: "SKIPPED",
            reason: "Order already at max auto-retry attempts (FAILED) — needs manual review.",
            checkedState
        });
        return;
    }

    try {
        const result = await retryOrder(incident.orderId, { isAdmin: true });
        await logAction({
            incident,
            outcome: "SUCCEEDED",
            reason: "Retried sweep via retryOrder().",
            checkedState,
            resultStatus: result?.status
        });
    } catch (err) {
        await logAction({
            incident,
            outcome: "FAILED",
            reason: err.message,
            checkedState
        });
    }

}

const WHITELIST = {
    FORWARDER_TRANSFER_FAILED: handleForwarderTransferFailed
};

export async function attemptRemediation(incident) {

    if (!incident?.code) return null;

    const handler = WHITELIST[incident.code];

    if (!handler) return null; // not whitelisted — left for a human, same as today

    try {
        await handler(incident);
    } catch (err) {
        console.error(`[Remediation] Handler for ${incident.code} threw:`, err.message);
    }

}

export default { attemptRemediation };
