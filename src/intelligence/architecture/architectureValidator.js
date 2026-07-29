import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";

class ArchitectureValidator {

    validateFlow(flow = {}) {

        const problems = [];

        const stages = flow.stages || [];
        const completed = new Set(flow.completed || []);

        for (const stage of stages) {

            const node = architectureKnowledgeGraph.get(stage.id);

            if (!node) {
                problems.push({
                    code: "UNKNOWN_STAGE",
                    stage: stage.id,
                    severity: "HIGH"
                });
                continue;
            }

            for (const dependency of (node.previous || [])) {

                if (!completed.has(dependency)) {
                    problems.push({
                        code: "DEPENDENCY_NOT_COMPLETED",
                        stage: stage.id,
                        dependency,
                        severity: "HIGH"
                    });
                }

            }

        }

        return {
            ok: problems.length === 0,
            problems
        };

    }

}

export default new ArchitectureValidator();
