import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";
import executionExpectationsEngine from "./executionExpectationsEngine.js";

class RuntimeArchitectureObserver {

    constructor() {
        this.active = new Map();
        this.history = new Map();
    }

    started(componentId, metadata = {}) {

        this.active.set(componentId, {
            startedAt: Date.now(),
            metadata
        });

    }

    completed(componentId) {

        const active = this.active.get(componentId);

        if (!active) {
            return {
                ok: false,
                reason: "NOT_STARTED"
            };
        }

        const expected =
            executionExpectationsEngine.expectedNext(componentId);

        this.active.delete(componentId);

        this.history.set(componentId, {
            status: "COMPLETED",
            lastSeenAt: Date.now(),
            duration: Date.now() - active.startedAt
        });

        return {
            ok: true,
            component: componentId,
            duration: Date.now() - active.startedAt,
            expectedNext: expected
        };

    }

    failed(componentId, error = {}) {

        const active = this.active.get(componentId);

        this.active.delete(componentId);

        this.history.set(componentId, {
            status: "FAILED",
            lastSeenAt: Date.now(),
            duration: active ? Date.now() - active.startedAt : null,
            error: error?.message || String(error)
        });

        return {
            ok: false,
            component: componentId,
            error: error?.message || String(error),
            duration: active ? Date.now() - active.startedAt : null
        };

    }

    lastSeen(componentId) {

        return this.history.get(componentId) || null;

    }

    verify(componentId) {

        const node =
            architectureKnowledgeGraph.get(componentId);

        if (!node) {

            return {
                ok: false,
                reason: "UNKNOWN_COMPONENT"
            };

        }

        return {
            ok: true,
            component: node.id,
            expects: node.expects || [],
            produces: node.produces || [],
            next: node.next || [],
            previous: node.previous || []
        };

    }

}

export default new RuntimeArchitectureObserver();
