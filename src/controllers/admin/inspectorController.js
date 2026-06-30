import InspectorFlow from "../../models/inspectorModel.js";

export async function getFlows(req, res) {

    try {

        const flows = await InspectorFlow
            .find()
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(flows);

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

        res.json(flow);

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
