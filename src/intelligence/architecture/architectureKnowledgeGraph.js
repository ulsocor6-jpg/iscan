class ArchitectureKnowledgeGraph {

    constructor() {
        this.nodes = new Map();
    }

    register(node) {
        this.nodes.set(node.id, {
            ...node,
            next: node.next || [],
            previous: node.previous || []
        });
    }

    get(id) {
        return this.nodes.get(id);
    }

    has(id) {
        return this.nodes.has(id);
    }

    getNext(id) {
        return this.nodes.get(id)?.next || [];
    }

    getPrevious(id) {
        return this.nodes.get(id)?.previous || [];
    }

    list() {
        return [...this.nodes.values()];
    }

    findByType(type) {
        return this.list().filter(n => n.type === type);
    }

    validate() {

        const errors = [];

        for (const node of this.list()) {

            for (const next of node.next) {
                if (!this.has(next)) {
                    errors.push({
                        node: node.id,
                        missingNext: next
                    });
                }
            }

            for (const previous of node.previous) {
                if (!this.has(previous)) {
                    errors.push({
                        node: node.id,
                        missingPrevious: previous
                    });
                }
            }

        }

        return errors;
    }

    describe(id) {

        const node = this.get(id);

        if (!node) return null;

        return {
            id: node.id,
            name: node.name,
            type: node.type,
            description: node.description,
            expects: node.expects || [],
            produces: node.produces || [],
            previous: node.previous,
            next: node.next
        };

    }

}

export default new ArchitectureKnowledgeGraph();
