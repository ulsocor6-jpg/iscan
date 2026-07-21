import InspectorFlow from "../../models/inspectorModel.js";
import reasoningEngine from "../../intelligence/reasoningEngine.js";

// Mongoose documents need to become plain objects before we can attach
// a computed "reasoning" field that isn't part of the schema.
function withReasoning(flowDoc) {
    const flow = flowDoc.toObject ? flowDoc.toObject() : flowDoc;
    flow.reasoning = reasoningEngine.analyzeFlow(flow);
    return flow;
}

export async function getFlows(req, res) {

    try {

        const flows = await InspectorFlow
            .find()
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(flows.map(withReasoning));

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

}

export async function getFlow(req, res) {

    try {

        const flow = await InspectorFlow.findOne({
            flowId: req.params.flowId
        });

        if (!flow) {

            return res.status(404).json({
                error: "Flow not found"
            });

        }

        res.json(withReasoning(flow));

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

}

export async function clearFlows(req, res) {

    try {

        await InspectorFlow.deleteMany({});

        res.json({
            success: true
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }

}
