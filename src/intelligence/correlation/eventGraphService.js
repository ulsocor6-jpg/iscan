import executionGraph from "./executionGraph.js";

class EventGraphService {

    create(event = {}) {

        const node =
            executionGraph.createNode(event);

        const parentId =
            event.parentId ||
            event.metadata?.parentId ||
            null;

        if (parentId) {

            executionGraph.connect(
                parentId,
                node.id
            );

        }

        return node;

    }

    trace(id) {

        return executionGraph.path(id);

    }

    node(id) {

        return executionGraph.node(id);

    }

    children(id) {

        return executionGraph.children(id);

    }

}

const eventGraphService = new EventGraphService();

eventGraphService.descriptor = {
    id: "eventGraphService",
    name: "Event Graph Service",
    type: "engine",
    domain: "intelligence",
    description: "Creates execution graph nodes for each normalized event.",
    previous: ["intelligenceEventFactory"],
    next: ["correlationEngine"],
    dependsOn: ["executionGraph"],
    criticality: "MEDIUM"
};

export default eventGraphService;
