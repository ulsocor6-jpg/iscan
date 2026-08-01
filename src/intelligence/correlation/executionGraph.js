class ExecutionGraph {

    constructor() {

        this.nodes = new Map();
        this.edges = new Map();
        this.flows = new Map();

    }

    createNode(event = {}) {

        const id =
            event.id ||
            event.eventId ||
            crypto.randomUUID();

        const node = {

            id,

            ...event,

            createdAt: Date.now()

        };

        this.nodes.set(id, node);

        if (!this.edges.has(id)) {

            this.edges.set(id, new Set());

        }

        return node;

    }

    connect(parentId, childId) {

        if (!this.edges.has(parentId)) {

            this.edges.set(parentId, new Set());

        }

        this.edges.get(parentId).add(childId);

    }

    node(id) {

        return this.nodes.get(id) || null;

    }

    children(id) {

        return [...(this.edges.get(id) || [])]
            .map(child => this.node(child));

    }

    path(id) {

        return {

            node: this.node(id),

            children: this.children(id)

        };

    }

    update(event = {}) {

        const node = this.createNode(event);

        const flowId =
            event.flowId ||
            event.orderId ||
            event.referenceId ||
            event.transactionId;

        if (!flowId) return;

        if (!this.flows.has(flowId)) {

            this.flows.set(flowId, {

                id: flowId,

                startedAt: Date.now(),

                stages: {},

                lastEvent: null

            });

        }

        const flow = this.flows.get(flowId);

        flow.lastEvent = event.type;

        flow.stages[event.source || "unknown"] = {

            status: event.status || "OK",

            updatedAt: Date.now(),

            nodeId: node.id

        };

    }

    snapshot() {

        return {

            flows: [...this.flows.values()],

            nodes: [...this.nodes.values()],

            edges:
                [...this.edges.entries()].map(([k,v]) => ({
                    parent:k,
                    children:[...v]
                }))

        };

    }

}

export default new ExecutionGraph();
