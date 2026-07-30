class ExecutionGraph {

    constructor() {

        this.nodes = new Map();

        this.edges = new Map();

    }

    createNode(event = {}) {

        const id =
            event.id ||
            crypto.randomUUID();

        const node = {

            id,

            timestamp:
                event.timestamp || new Date(),

            stage:
                event.stage || "UNKNOWN",

            type:
                event.type || "UNKNOWN",

            source:
                event.source || null,

            metadata:
                event.metadata || {}

        };

        this.nodes.set(id, node);

        if (!this.edges.has(id)) {

            this.edges.set(id, []);

        }

        return node;

    }

    connect(parentId, childId) {

        if (!this.edges.has(parentId)) {

            this.edges.set(parentId, []);

        }

        this.edges
            .get(parentId)
            .push(childId);

    }

    children(id) {

        return this.edges.get(id) || [];

    }

    node(id) {

        return this.nodes.get(id) || null;

    }

    path(startId) {

        const visited = new Set();

        const output = [];

        const walk = id => {

            if (visited.has(id))
                return;

            visited.add(id);

            const node =
                this.node(id);

            if (node)
                output.push(node);

            for (const child of this.children(id)) {

                walk(child);

            }

        };

        walk(startId);

        return output;

    }

    clear() {

        this.nodes.clear();

        this.edges.clear();

    }

}

export default new ExecutionGraph();
