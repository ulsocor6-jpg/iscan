import runtimeArchitectureObserver from "./runtimeArchitectureObserver.js";
import architectureExpectationTracker from "./architectureExpectationTracker.js";
import architectureReasoningEngine from "./architectureReasoningEngine.js";

class ArchitectureEventBridge {

    started(componentId, metadata = {}) {

        runtimeArchitectureObserver.started(
            componentId,
            metadata
        );

        architectureExpectationTracker.expect(
            componentId
        );

    }

    completed(componentId) {

        runtimeArchitectureObserver.completed(
            componentId
        );

        return architectureReasoningEngine.analyze(
            componentId
        );

    }

    failed(componentId, error = {}) {

        runtimeArchitectureObserver.failed(
            componentId,
            error
        );

        return architectureReasoningEngine.analyze(
            componentId
        );

    }

}

export default new ArchitectureEventBridge();
