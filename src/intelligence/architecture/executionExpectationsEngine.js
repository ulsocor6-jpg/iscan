import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";

class ExecutionExpectationsEngine {

    expectedNext(componentId) {

        const node =
            architectureKnowledgeGraph.get(componentId);

        if (!node)
            return [];

        return node.next || [];

    }

    expectedInputs(componentId) {

        const node =
            architectureKnowledgeGraph.get(componentId);

        return node?.inputs || [];
    }

    expectedOutputs(componentId) {

        const node =
            architectureKnowledgeGraph.get(componentId);

        return node?.outputs || [];
    }

    expectedEvents(componentId) {

        const node =
            architectureKnowledgeGraph.get(componentId);

        return {

            consumes:
                node?.eventsConsumed || [],

            produces:
                node?.eventsProduced || []

        };

    }

    explain(componentId) {

        const node =
            architectureKnowledgeGraph.describe(componentId);

        if (!node)
            return null;

        return {

            component: node.name,

            type: node.type,

            expects: node.expects,

            produces: node.produces,

            previous: node.previous,

            next: node.next

        };

    }

}

export default new ExecutionExpectationsEngine();
