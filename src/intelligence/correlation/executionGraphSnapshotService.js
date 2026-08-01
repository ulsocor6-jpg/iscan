import executionGraph from "./executionGraph.js";

class ExecutionGraphSnapshotService {

    getSnapshot() {

        return {

            generatedAt: new Date().toISOString(),

            flows: executionGraph.snapshot()

        };

    }

}

export default new ExecutionGraphSnapshotService();
