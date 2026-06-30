import crypto from "crypto";
import Inspector from "../models/inspectorModel.js";

class InspectorService {

    async startFlow({
        pipeline,
        source,
        transactionType,
        referenceId = null,
        amount = null,
        currency = null,
        sender = null,
        senderPhone = null,
        senderLastFour = null,
        rawNotification = null,
        parsedNotification = null
    }) {

        const flowId =
            "INS-" +
            Date.now() +
            "-" +
            crypto.randomBytes(3).toString("hex").toUpperCase();

        const flow = await Inspector.create({

            flowId,

            pipeline,

            source,

            transactionType,

            referenceId,

            amount,

            currency,

            sender,

            senderPhone,

            senderLastFour,

            rawNotification,

            parsedNotification,

            status: "RUNNING",

            stages: []

        });

        return flow;

    }

    async startStage(flowId, stageName, input = {}) {

        return Inspector.findOneAndUpdate(

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

            { new: true }

        );

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

        return flow;

    }

    async skipStage(
        flowId,
        stageName,
        reason = ""
    ) {

        return Inspector.findOneAndUpdate(

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

            { new: true }

        );

    }

    async finishFlow(flowId) {

        return Inspector.findOneAndUpdate(

            { flowId },

            {

                status: "SUCCESS"

            },

            { new: true }

        );

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
