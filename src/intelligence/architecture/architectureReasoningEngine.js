import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";
import runtimeArchitectureObserver from "./runtimeArchitectureObserver.js";

class ArchitectureReasoningEngine {

    analyze(componentId) {

        const runtime =
            runtimeArchitectureObserver.verify(componentId);

        if (!runtime.ok)
            return runtime;

        const node =
            architectureKnowledgeGraph.get(componentId);

        const findings = [];

        for (const next of (node.next || [])) {

            if (!architectureKnowledgeGraph.has(next)) {

                findings.push({

                    code: "UNKNOWN_NEXT_COMPONENT",

                    severity: "HIGH",

                    component: next

                });

            }

        }

        return {

            ok: findings.length === 0,

            component: componentId,

            findings,

            runtime

        };

    }

    analyzeAll() {

        const results = [];

        for (const node of architectureKnowledgeGraph.list()) {

            results.push(
                this.analyze(node.id)
            );

        }

        return results;

    }

}

export default new ArchitectureReasoningEngine();
