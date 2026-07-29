import Inspector from "../models/inspectorModel.js";
import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import FlowerOrder from "../models/flower/flowerOrderModel.js";
import BlockchainInbox from "../models/blockchain/blockchainInboxModel.js";
import Ledger from "../models/ledgerModel.js";
import AcknowledgedItem from "../models/acknowledgedItemModel.js";

export async function getUserDashboard(req, res) {
    try {
        const userId = req.user.id;
        const [deposits, withdrawals, swaps, recentLedger, inspectorFlows, acknowledged] = await Promise.all([
            DirectDeposit.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
            WithdrawalRequest.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
            FlowerOrder.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
            Ledger.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
            Inspector.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
            AcknowledgedItem.find({ userId }).lean(),
        ]);

        const ackSet = new Set(acknowledged.map(a => a.itemKey));

        const failedDeposits = deposits.filter(d => d.status === "failed" || d.status === "expired");
        const failedWithdrawals = withdrawals.filter(w => w.status === "failed");
        const stuckFlows = inspectorFlows.filter(f => f.status === "RUNNING" && f.stages?.some(s => s.status === "FAILED"));

        const liveDeposits = deposits.filter(d => !ackSet.has(`deposit:${d._id}`));
        const liveWithdrawals = withdrawals.filter(w => !ackSet.has(`withdrawal:${w._id}`));
        const liveSwaps = swaps.filter(s => !ackSet.has(`swap:${s.orderId}`));
        const liveStuckFlows = stuckFlows.filter(f => !ackSet.has(`flow:${f.flowId}`));

        const liveFailedDeposits = liveDeposits.filter(d => d.status === "failed" || d.status === "expired");
        const liveFailedWithdrawals = liveWithdrawals.filter(w => w.status === "failed");
        const liveFailedSwaps = liveSwaps.filter(s => s.status?.startsWith("FAILED"));

        const liveTotal = liveDeposits.length + liveWithdrawals.length + liveSwaps.length;
        const liveFailedTotal = liveFailedDeposits.length + liveFailedWithdrawals.length + liveFailedSwaps.length + liveStuckFlows.length;

        res.json({ success: true, data: {
            summary: {
                totalDeposits: liveDeposits.length, failedDeposits: liveFailedDeposits.length,
                totalWithdrawals: liveWithdrawals.length, failedWithdrawals: liveFailedWithdrawals.length,
                totalSwaps: liveSwaps.length, failedSwaps: liveFailedSwaps.length,
                stuckFlows: liveStuckFlows.length,
                healthScore: liveTotal ? Math.round(100 - (liveFailedTotal / liveTotal * 100)) : 100,
            },
            deposits: deposits.map(d => ({
                id: d._id, itemKey: `deposit:${d._id}`, acknowledged: ackSet.has(`deposit:${d._id}`),
                type: "deposit", amount: d.amount, currency: d.currency||"PHP", source: d.source,
                status: d.status, createdAt: d.createdAt, failureReason: d.failReason,
            })),
            withdrawals: withdrawals.map(w => ({
                id: w._id, itemKey: `withdrawal:${w._id}`, acknowledged: ackSet.has(`withdrawal:${w._id}`),
                referenceId: w.referenceId||`WD-${w._id}`, type: "withdrawal", amount: w.amount,
                currency: w.asset||"PHP", network: w.network, status: w.status, createdAt: w.createdAt,
                failureReason: w.failReason||w.error, canRetry: w.status==="failed", canCancel: w.status==="pending_review",
            })),
            swaps: swaps.map(s => ({
                id: s._id, itemKey: `swap:${s.orderId}`, acknowledged: ackSet.has(`swap:${s.orderId}`),
                orderId: s.orderId, type: "swap", direction: s.direction, amount: s.expectedAmount||s.usdcAmountIn||0,
                currency: "USDC", status: s.status, currentStage: s.currentStage, createdAt: s.createdAt,
                failureReason: s.failureReason||(s.status?.startsWith("FAILED")?`Failed at ${s.status.replace("FAILED_","")}`:null),
                canRetry: s.status?.startsWith("FAILED")||s.status==="WAITING_DEPOSIT", canCancel: s.status==="WAITING_DEPOSIT",
                depositAddress: s.depositAddress, credited: s.status==="COMPLETED"?true:(s.status?.startsWith("FAILED")?false:null),
            })),
            recentActivity: recentLedger.slice(0,5).map(l => ({ type: l.type, amount: l.amount, currency: l.currency, description: l.description, createdAt: l.createdAt })),
            stuckFlows: stuckFlows.map(f => ({
                flowId: f.flowId, itemKey: `flow:${f.flowId}`, acknowledged: ackSet.has(`flow:${f.flowId}`),
                pipeline: f.pipeline, status: f.status,
                stages: (f.stages||[]).map(s => ({ name: s.name, status: s.status, error: s.error })), createdAt: f.createdAt,
            })),
        }});
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}

export async function acknowledgeItem(req, res) {
    try {
        const userId = req.user.id;
        const { itemKey } = req.body;
        if (!itemKey) return res.status(400).json({ success: false, error: "itemKey required" });
        await AcknowledgedItem.updateOne(
            { userId, itemKey },
            { $setOnInsert: { userId, itemKey, acknowledgedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}

export async function getFlowDetail(req, res) {
    try {
        const flow = await Inspector.findOne({ flowId: req.params.flowId, userId: req.user.id }).lean();
        if (!flow) return res.status(404).json({ success: false, error: "Not found" });
        res.json({ success: true, data: { flowId: flow.flowId, pipeline: flow.pipeline, status: flow.status, stages: flow.stages } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}

export async function retryUserFlow(req, res) {
    try {
        const { flowId } = req.body;
        const order = await FlowerOrder.findOne({ orderId: flowId, userId: req.user.id }).lean();
        if (order) {
            if (order.status === "WAITING_DEPOSIT" || order.status === "CREATED") {
                const deposit = await BlockchainInbox.findOne({ toAddress: order.depositAddress?.toLowerCase(), status: "CONFIRMED" }).sort({ createdAt: -1 }).lean();
                if (deposit) return res.json({ success: true, data: { message: `Deposit found! ${deposit.amount} received.`, flowId, depositFound: true } });
                return res.json({ success: true, data: { message: `No deposit at ${order.depositAddress?.slice(0,10)}... Send funds to continue.`, flowId, depositFound: false } });
            }
            if (order.status?.startsWith("FAILED")) {
                const { retryOrder } = await import("../services/flower/flowerOrderRecovery.js");
                await retryOrder(order.orderId, { requesterId: req.user.id });
                return res.json({ success: true, data: { message: "Retry initiated.", flowId } });
            }
        }
        const flow = await Inspector.findOne({ flowId, userId: req.user.id });
        if (!flow) return res.status(404).json({ success: false, error: "Not found" });
        const failed = flow.stages?.find(s => s.status === "FAILED");
        if (failed) { failed.status = "PENDING"; failed.error = null; }
        flow.status = "RUNNING";
        await flow.save();
        res.json({ success: true, data: { message: "Retry initiated.", flowId } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}

export async function cancelUserFlow(req, res) {
    try {
        const { flowId } = req.body;
        const order = await FlowerOrder.findOne({ orderId: flowId, userId: req.user.id });
        if (order && (order.status === "WAITING_DEPOSIT" || order.status === "CREATED")) {
            order.status = "FAILED";
            order.failureReason = "Cancelled by user";
            await order.save();
            return res.json({ success: true, data: { message: "Cancelled.", flowId } });
        }
        const flow = await Inspector.findOne({ flowId, userId: req.user.id });
        if (!flow) return res.status(404).json({ success: false, error: "Not found" });
        flow.status = "FAILED";
        flow.stages?.push({ name: "CANCELLED", status: "SUCCESS" });
        await flow.save();
        res.json({ success: true, data: { message: "Cancelled.", flowId } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}
