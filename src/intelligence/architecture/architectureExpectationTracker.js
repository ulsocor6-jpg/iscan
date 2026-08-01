import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";

class ArchitectureExpectationTracker {

    constructor() {

        this.expected = new Map();

    }

    expect(componentId) {

        const next =
            architectureKnowledgeGraph.getNext(componentId);

        for (const target of next) {

            this.expected.set(target, {

                expectedFrom: componentId,

                expectedAt: Date.now(),

                received: false

            });

        }

    }

    received(componentId) {

        const state =
            this.expected.get(componentId);

        if (!state)
            return;

        state.received = true;

        state.receivedAt = Date.now();

    }

    pending() {

        return [...this.expected.entries()]
            .filter(([_, v]) => !v.received);

    }

    overdue(timeout = 5000) {

        const now = Date.now();

        return this.pending().filter(

            ([_, value]) =>

                now - value.expectedAt > timeout

        );

    }

}

export default new ArchitectureExpectationTracker();
