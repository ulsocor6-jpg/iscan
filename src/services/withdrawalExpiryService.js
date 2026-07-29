import brainBus from "../brainbus/brainBus.js";
// src/services/withdrawalExpiryService.js
//
// Sweeps PHP withdrawals (maya/bank/gcash) that have sat in "pending_review"
// past their 10-minute processing window and weren't approved/rejected in
// time. Refunds the original debit (amount + fee) back to the user's
// ledger, marks the request "expired", alerts, and emits an event so the
// frontend (which is polling /cashout/:referenceId/status) picks it up
// on its next poll.

import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "./walletService.js";
import eventStreamService from "./eventStreamService.js";
import { sendTelegramAlert } from "./telegramAlertService.js";
import healthRegistry from "../intelligence/healthRegistry.js";

const SWEEP_INTERVAL_MS = 30000; // check every 30s — deadline itself is 10 min, no need to poll faster

let sweeping = false;

async function sweepExpiredWithdrawals() {

    const expired = await WithdrawalRequest.find({
        status: "pending_review",
        expiresAt: { $ne: null, $lte: new Date() },
        type: { $in: ["maya", "bank", "gcash"] }, // scoped to PHP flow only — crypto pending_review (over auto-approve limit) is a separate manual path, not time-boxed the same way
    });

    for (const withdrawal of expired) {

        // Only `withdrawal.amount` was ever debited (see paymentRoutes.js
        // /cashout) — fee comes out of netAmount when sent, not charged
        // separately. Refunding amount+fee here would over-refund.
        const refundTotal = withdrawal.amount;

        try {

            await walletService.credit(
                withdrawal.userId,
                "PHP",
                refundTotal,
                {
                    referenceId: `EXPIRE-REFUND-${withdrawal.referenceId || withdrawal._id}`,
                    description: `Withdrawal not processed within window — refunded (₱${refundTotal})`,
                    transactionType: "cashout_refund",
                }
            );

            withdrawal.status = "expired";
            withdrawal.failReason = "Not processed within the 10-minute window — automatically refunded.";
            await withdrawal.save();
        brainBus.emit("withdrawal.expired", { referenceId: withdrawal.referenceId, userId: withdrawal.userId, amount: withdrawal.amount, reason: "Not processed within window" });

            eventStreamService.emit("withdrawal.expired", {
                entityId: withdrawal.referenceId || withdrawal._id.toString(),
                userId: withdrawal.userId,
                referenceId: withdrawal.referenceId,
                amount: withdrawal.amount,
                fee: withdrawal.fee,
                refundTotal,
                message: `Withdrawal ${withdrawal.referenceId} expired and was refunded (₱${refundTotal}).`,
            }).catch(err => {
                console.error("[withdrawalExpiryService] Event emit failed:", err.message);
            });

            sendTelegramAlert(
                `⏱️ <b>Cashout expired — auto-refunded</b>\n` +
                `Ref: <code>${withdrawal.referenceId}</code>\n` +
                `User: <code>${withdrawal.userId}</code>\n` +
                `Refunded: ₱${refundTotal}\n` +
                `Reason: not processed within 10-minute window.`
            ).catch(err => {
                console.error("[withdrawalExpiryService] Telegram alert failed:", err.message);
            });

        } catch (err) {

            console.error(
                `[withdrawalExpiryService] Failed to refund ${withdrawal.referenceId}:`,
                err.message
            );

            sendTelegramAlert(
                `🚨 <b>Cashout expiry refund FAILED</b>\n` +
                `Ref: <code>${withdrawal.referenceId}</code>\n` +
                `Error: ${err.message}\n` +
                `Needs manual review — funds may still be debited.`
            ).catch(() => {});

        }

    }

}

function start() {

    healthRegistry.registerNode({ node: "withdrawalExpiry", type: "worker" });
    healthRegistry.report({ node: "withdrawalExpiry", status: "ONLINE" });

    setInterval(() => {
        if (sweeping) return;
        sweeping = true;
        sweepExpiredWithdrawals()
            .then(() => {
                healthRegistry.report({ node: "withdrawalExpiry", status: "ONLINE", metrics: { lastSweepAt: new Date() } });
            })
            .catch(err => {
                console.error("[withdrawalExpiryService]", err);
                healthRegistry.report({ node: "withdrawalExpiry", status: "WARNING", error: err.message });
            })
            .finally(() => { sweeping = false; });
    }, SWEEP_INTERVAL_MS);

    console.log("[withdrawalExpiryService] Started — sweeping every 30s.");

}

export default { start, sweepExpiredWithdrawals };
