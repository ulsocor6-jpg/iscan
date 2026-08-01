import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";
import runtimeArchitectureObserver from "./runtimeArchitectureObserver.js";

class ArchitectureViolationEngine {

    analyze(componentId) {

        const node =
            architectureKnowledgeGraph.get(componentId);

        if (!node) {

            return [{
                code: "UNKNOWN_COMPONENT",
                severity: "HIGH",
                component: componentId
            }];

        }

        const violations = [];

        const runtime =
            runtimeArchitectureObserver.active.get(componentId);

        if (!runtime) {

            violations.push({
                code: "NOT_EXECUTED",
                severity: "CRITICAL",
                component: componentId
            });

            return violations;

        }

        for (const dependency of node.previous || []) {

            if (
                !runtimeArchitectureObserver.active.has(
                    dependency
                )
            ) {

                violations.push({
                    code: "DEPENDENCY_NOT_EXECUTED",
                    severity: "HIGH",
                    dependency,
                    component: componentId
                });

            }

        }

        for (const next of node.next || []) {

            if (
                !runtimeArchitectureObserver.active.has(next)
            ) {

                violations.push({
                    code: "EXPECTED_COMPONENT_NOT_REACHED",
                    severity: "MEDIUM",
                    expected: next,
                    component: componentId
                });

            }

        }

        return violations;

    }

}

export default new ArchitectureViolationEngine();
