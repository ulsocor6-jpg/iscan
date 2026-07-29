import architectureKnowledgeGraph from "../architecture/architectureKnowledgeGraph.js";
import flowRegistry from "./flowRegistry.js";
import flowVerifier from "./flowVerifier.js";

class FlowIntelligenceEngine {

    analyze(flowId, completedStages = []) {

        const verification =
            flowVerifier.verify(flowId, completedStages);

        if (!verification.ok) {
            return verification;
        }

        const flow = flowRegistry.get(flowId);

        const recommendations = [];

        for (const stageId of verification.missing) {

            const node =
                architectureKnowledgeGraph.describe(stageId);

            recommendations.push({

                stage: stageId,

                description: node?.description,

                expectedInputs: node?.expects || [],

                expectedOutputs: node?.produces || [],

                next: node?.next || [],

                recommendation:
                    "Investigate why this stage never executed."

            });

        }

        return {

            ok: true,

            flow: flow.name,

            missing: verification.missing,

            duplicated: verification.duplicated,

            recommendations

        };

    }

}

export default new FlowIntelligenceEngine();
