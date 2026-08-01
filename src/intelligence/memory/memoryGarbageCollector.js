import memoryManager from "./memoryManager.js";
import memoryPolicyEngine from "./memoryPolicyEngine.js";
import memoryStorageAdapter from "./memoryStorageAdapter.js";

class MemoryGarbageCollector {

    collect() {

        const removed = [];

        const tiers = [

            ["runtime", memoryManager.runtime],
            ["working", memoryManager.working],
            ["operational", memoryManager.operational],
            ["knowledge", memoryManager.knowledge],
            ["archive", memoryManager.archive]

        ];

        for (const [tier, store] of tiers) {

            for (const [key, memory] of store.entries()) {

                if (
                    !memoryPolicyEngine.shouldKeep(memory)
                ) {

                    store.delete(key);

                    removed.push({

                        tier,

                        key,

                        retention:
                            memory.memory.retention

                    });

                }

            }

        }

        return {

            removed,

            total:
                removed.length

        };

    }

    async archive(key, memory) {

        return memoryStorageAdapter.save(

            "ARCHIVE",

            key,

            memory

        );

    }

}

export default new MemoryGarbageCollector();
