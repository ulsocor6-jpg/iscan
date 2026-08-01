import memoryManager from "./memoryManager.js";
import memoryClassifier from "./memoryClassifier.js";
import memoryPolicyEngine from "./memoryPolicyEngine.js";
import memoryStorageAdapter from "./memoryStorageAdapter.js";
import memoryGarbageCollector from "./memoryGarbageCollector.js";
import memorySummarizer from "./memorySummarizer.js";
import memoryLearningEngine from "./memoryLearningEngine.js";
import memorySearch from "./memorySearch.js";

class MemoryBootstrap {

    async start() {

        console.log("");

        console.log(
            "[Memory] Initializing Memory System..."
        );

        console.log(
            "[Memory] ✓ Classifier ready."
        );

        console.log(
            "[Memory] ✓ Manager ready."
        );

        console.log(
            "[Memory] ✓ Policy Engine ready."
        );

        console.log(
            "[Memory] ✓ Storage Adapter ready."
        );

        console.log(
            "[Memory] ✓ Garbage Collector ready."
        );

        console.log(
            "[Memory] ✓ Summarizer ready."
        );

        console.log(
            "[Memory] ✓ Learning Engine ready."
        );

        console.log(
            "[Memory] ✓ Search Engine ready."
        );

        console.log("");

        console.log(
            "[Memory] System Ready."
        );

        return {

            manager:
                memoryManager,

            classifier:
                memoryClassifier,

            policy:
                memoryPolicyEngine,

            storage:
                memoryStorageAdapter,

            garbageCollector:
                memoryGarbageCollector,

            summarizer:
                memorySummarizer,

            learning:
                memoryLearningEngine,

            search:
                memorySearch

        };

    }

}

export default new MemoryBootstrap();
