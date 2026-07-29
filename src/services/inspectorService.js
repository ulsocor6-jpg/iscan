import crypto from "crypto";
import Inspector from "../models/inspectorModel.js";
import blockchainInspector from "./blockchain/inspector/blockchainInspector.js";
import inspectorBridge from "../brainbus/inspectorBridge.js";

class InspectorService {

    async startFlow({
        flowId = null,
        pipeline,
        source,
        transactionType,
        referenceId = null,
        amount = null,
        currency = null,
        ...rest
    }) {

        const finalFlowId =
            flowId ||
            "INS-" +
            Date.now() +
            "-" +
            crypto.randomBytes(3).toString("hex").toUpperCase();

        const flow = await Inspector.create({

            flowId: finalFlowId,

            pipeline,

            source,

            transactionType,

            referenceId,

            amount,

            currency,

            ...rest,

            status: "RUNNING",

            stages: []

        });

        // ── BrainBus: notify all subscribers ──────────────────────────
        inspectorBridge.onFlowStarted(flow);

        return flow;

    }

    async startStage(flowId, stageName, input = {}) {

        const flow = await Inspector.findOneAndUpdate(

            { flowId },

            {
                $push: {

                    stages: {

                        name: stageName,

                        status: "RUNNING",

                        startedAt: new Date(),

                        input

                    }

                }

            },

            { returnDocument: 'after' }

        );

        // ── BrainBus: notify stage started ────────────────────────────
        inspectorBridge.onFlowStage(flowId, stageName, { status: "RUNNING", input });

        return flow;

    }

    async finishStage(
        flowId,
        stageName,
        {
            output = null,
            query = null,
            result = null,
            decision = null
        } = {}
    ) {

        const flow = await Inspector.findOne({ flowId });

        if (!flow) return;

        const stage = flow.stages.findLast(
            s =>
                s.name === stageName &&
                s.status === "RUNNING"
        );

        if (!stage) return;

        stage.status = "SUCCESS";

        stage.finishedAt = new Date();

        stage.durationMs =
            stage.finishedAt.getTime() -
            stage.startedAt.getTime();

        stage.output = output;

        stage.query = query;

        stage.result = result;

        stage.decision = decision;

        await flow.save();

        // ── BrainBus: notify stage completed ──────────────────────────
        inspectorBridge.onFlowStage(flowId, stageName, {
            status: "SUCCESS",
            output,
            decision,
            durationMs: stage.durationMs
        });

        return flow;

    }

    async failStage(
        flowId,
        stageName,
        error,
        {
            output = null,
            query = null,
            result = null,
            decision = null
        } = {}
    ) {

        const flow = await Inspector.findOne({ flowId });

        if (!flow) return;

        const stage = flow.stages.findLast(
            s =>
                s.name === stageName &&
                s.status === "RUNNING"
        );

        if (!stage) return;

        stage.status = "FAILED";

        stage.finishedAt = new Date();

        stage.durationMs =
            stage.finishedAt.getTime() -
            stage.startedAt.getTime();

        stage.error = error;

        stage.output = output;

        stage.query = query;

        stage.result = result;

        stage.decision = decision;

        flow.status = "FAILED";

        await flow.save();

        // ── BrainBus: notify stage failed ─────────────────────────────
        inspectorBridge.onFlowStage(flowId, stageName, {
            status: "FAILED",
            error,
            output,
            decision,
            durationMs: stage.durationMs
        });

        // Bridge into the same event stream blockchain incidents use, so
        // PHP_DEPOSIT stage failures reach incidentEngine too.
        blockchainInspector.error(
            stageName,
            error,
            {
                flowId,
                pipeline: flow.pipeline,
                referenceId: flow.referenceId,
                source: flow.source
            }
        );

        return flow;

    }

    async skipStage(
        flowId,
        stageName,
        reason = ""
    ) {

        const flow = await Inspector.findOneAndUpdate(

            { flowId },

            {
                $push: {

                    stages: {

                        name: stageName,

                        status: "SKIPPED",

                        startedAt: new Date(),

                        finishedAt: new Date(),

                        durationMs: 0,

                        decision: {

                            reason

                        }

                    }

                }

            },

            { returnDocument: 'after' }

        );

        // ── BrainBus: notify stage skipped ────────────────────────────
        inspectorBridge.onFlowStage(flowId, stageName, {
            status: "SKIPPED",
            decision: { reason }
        });

        return flow;

    }

    async finishFlow(flowId) {

        const flow = await Inspector.findOneAndUpdate(

            { flowId },

            {

                status: "SUCCESS"

            },

            { returnDocument: 'after' }

        );

        // ── BrainBus: notify flow completed ───────────────────────────
        inspectorBridge.onFlowCompleted(flowId, { status: "SUCCESS" });

        return flow;

    }

    async getFlow(flowId) {

        return Inspector.findOne({ flowId });

    }

    // Used to link a flow that started at deposit-request time (UI) to the
    // email/notification that later confirms it, via the shared referenceId.
    async findRunningByReference(referenceId) {

        if (!referenceId) return null;

        return Inspector.findOne({
            referenceId,
            status: "RUNNING"
        }).sort({ createdAt: -1 });

    }

    async latest(limit = 100) {

        return Inspector
            .find()
            .sort({ createdAt: -1 })
            .limit(limit);

    }

}

export default new InspectorService();
