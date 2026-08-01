import memoryClassifier from "./memoryClassifier.js";

class MemoryManager {

    constructor() {

        this.runtime = new Map();

        this.working = new Map();

        this.operational = new Map();

        this.knowledge = new Map();

        this.archive = new Map();

    }

    remember(key, event = {}) {

        const memory =
            memoryClassifier.classify(event);

        const record = {

            key,

            createdAt: Date.now(),

            memory,

            event

        };

        switch (memory.tier) {

            case "RUNTIME":

                this.runtime.set(key, record);

                break;

            case "WORKING":

                this.working.set(key, record);

                break;

            case "OPERATIONAL":

                this.operational.set(key, record);

                break;

            case "KNOWLEDGE":

                this.knowledge.set(key, record);

                break;

            case "ARCHIVE":

                this.archive.set(key, record);

                break;

            default:

                this.working.set(key, record);

        }

        return record;

    }

    recall(key) {

        return (

            this.runtime.get(key) ||

            this.working.get(key) ||

            this.operational.get(key) ||

            this.knowledge.get(key) ||

            this.archive.get(key) ||

            null

        );

    }

    forget(key) {

        this.runtime.delete(key);

        this.working.delete(key);

        this.operational.delete(key);

        this.knowledge.delete(key);

        this.archive.delete(key);

    }

    stats() {

        return {

            runtime:
                this.runtime.size,

            working:
                this.working.size,

            operational:
                this.operational.size,

            knowledge:
                this.knowledge.size,

            archive:
                this.archive.size

        };

    }

}

export default new MemoryManager();
