class MemorySummarizer {

    summarize(memories = []) {

        if (!Array.isArray(memories) || memories.length === 0) {

            return {

                total: 0,

                summary: "No memories.",

                statistics: {}

            };

        }

        const channels = {};

        const levels = {};

        const types = {};

        for (const memory of memories) {

            const event =
                memory.event || {};

            const channel =
                event.channel || "unknown";

            const level =
                event.level || "unknown";

            const type =
                event.type || "unknown";

            channels[channel] =
                (channels[channel] || 0) + 1;

            levels[level] =
                (levels[level] || 0) + 1;

            types[type] =
                (types[type] || 0) + 1;

        }

        return {

            total:
                memories.length,

            summary:
                `Summarized ${memories.length} memories.`,

            statistics: {

                channels,

                levels,

                types

            }

        };

    }

}

export default new MemorySummarizer();
