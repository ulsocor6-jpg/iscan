import memoryManager from "./memoryManager.js";

class MemorySearch {

    all() {

        return [

            ...memoryManager.runtime.values(),

            ...memoryManager.working.values(),

            ...memoryManager.operational.values(),

            ...memoryManager.knowledge.values(),

            ...memoryManager.archive.values()

        ];

    }

    byTier(tier) {

        switch (tier) {

            case "RUNTIME":
                return [...memoryManager.runtime.values()];

            case "WORKING":
                return [...memoryManager.working.values()];

            case "OPERATIONAL":
                return [...memoryManager.operational.values()];

            case "KNOWLEDGE":
                return [...memoryManager.knowledge.values()];

            case "ARCHIVE":
                return [...memoryManager.archive.values()];

            default:
                return [];

        }

    }

    byChannel(channel) {

        return this.all().filter(memory =>

            memory.event?.channel === channel

        );

    }

    byType(type) {

        return this.all().filter(memory =>

            memory.event?.type === type

        );

    }

    byImportance(minImportance = 0) {

        return this.all().filter(memory =>

            (memory.memory?.importance || 0) >= minImportance

        );

    }

    find(predicate) {

        return this.all().filter(predicate);

    }

    latest(limit = 20) {

        return this.all()

            .sort(

                (a, b) =>

                    b.createdAt - a.createdAt

            )

            .slice(0, limit);

    }

}

export default new MemorySearch();
