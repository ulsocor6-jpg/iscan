import flowRegistry from "./flowRegistry.js";

class FlowVerifier {

    verify(flowId, completedStages = []) {

        const flow = flowRegistry.get(flowId);

        if (!flow) {

            return {
                ok: false,
                reason: "FLOW_NOT_FOUND"
            };

        }

        const missing = [];
        const duplicated = [];

        const seen = new Set();

        for (const stage of completedStages) {

            if (seen.has(stage))
                duplicated.push(stage);

            seen.add(stage);

        }

        for (const stage of flow.stages) {

            if (!completedStages.includes(stage.id))
                missing.push(stage.id);

        }

        return {

            ok:
                missing.length === 0 &&
                duplicated.length === 0,

            flowId,

            missing,

            duplicated,

            completed: completedStages

        };

    }

}

export default new FlowVerifier();
