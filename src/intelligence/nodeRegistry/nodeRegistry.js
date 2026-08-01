class NodeRegistry {

    constructor() {

        this.nodes = new Map();

    }

    register(node = {}) {

        const {

            nodeId,

            nodeType = "UNKNOWN",

            role = "",

            version = "",

            platform = "",

            capabilities = []

        } = node;

        if (!nodeId) {
            throw new Error("nodeId is required");
        }

        this.nodes.set(nodeId, {

            ...(this.nodes.get(nodeId) || {}),

            nodeId,

            nodeType,

            role,

            version,

            platform,

            capabilities,

            registeredAt:
                this.nodes.get(nodeId)?.registeredAt ||
                new Date(),

            updatedAt:
                new Date()

        });

    }

    get(nodeId) {

        return this.nodes.get(nodeId);

    }

    snapshot() {

        return [...this.nodes.values()];

    }

}

export default new NodeRegistry();
