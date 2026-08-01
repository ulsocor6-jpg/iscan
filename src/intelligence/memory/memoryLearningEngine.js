class MemoryLearningEngine {

    constructor() {

        this.patterns = new Map();

    }

    learn(memory = {}) {

        const event =
            memory.event || {};

        const key = [

            event.channel || "unknown",

            event.type || "unknown",

            event.code || "none"

        ].join(":");

        const pattern =
            this.patterns.get(key) || {

                key,

                occurrences: 0,

                firstSeen: Date.now(),

                lastSeen: null,

                successfulRecoveries: 0,

                failedRecoveries: 0

            };

        pattern.occurrences++;

        pattern.lastSeen = Date.now();

        this.patterns.set(
            key,
            pattern
        );

        return pattern;

    }

    recordRecovery(key, success = true) {

        const pattern =
            this.patterns.get(key);

        if (!pattern)
            return;

        if (success)

            pattern.successfulRecoveries++;

        else

            pattern.failedRecoveries++;

    }

    confidence(key) {

        const pattern =
            this.patterns.get(key);

        if (!pattern)
            return 0;

        const total =

            pattern.successfulRecoveries +

            pattern.failedRecoveries;

        if (total === 0)
            return 0;

        return (
            pattern.successfulRecoveries /
            total
        );

    }

    patternsList() {

        return [
            ...this.patterns.values()
        ];

    }

}

export default new MemoryLearningEngine();
