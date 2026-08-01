class MemoryClassifier {

    classify(event = {}) {

        const channel =
            event.channel || "";

        const level =
            event.level || "";

        const type =
            event.type || "";

        // ----------------------------------------------------
        // Critical financial records
        // ----------------------------------------------------

        if (
            channel.startsWith("ledger") ||
            channel.startsWith("treasury") ||
            channel.startsWith("wallet")
        ) {

            return {
                tier: "OPERATIONAL",
                importance: 100,
                retention: "PERMANENT",
                searchable: true,
                learnable: true
            };

        }

        // ----------------------------------------------------
        // Mission lifecycle
        // ----------------------------------------------------

        if (
            channel.startsWith("mission") ||
            channel.startsWith("deposit") ||
            channel.startsWith("withdrawal") ||
            channel.startsWith("swap")
        ) {

            return {
                tier: "WORKING",
                importance: 80,
                retention: "MISSION",
                searchable: true,
                learnable: true
            };

        }

        // ----------------------------------------------------
        // Incidents & AI reasoning
        // ----------------------------------------------------

        if (
            channel.startsWith("operator") ||
            channel.startsWith("reasoning") ||
            channel.startsWith("decision") ||
            channel.startsWith("compliance")
        ) {

            return {
                tier: "KNOWLEDGE",
                importance: 90,
                retention: "LONG_TERM",
                searchable: true,
                learnable: true
            };

        }

        // ----------------------------------------------------
        // Runtime noise
        // ----------------------------------------------------

        if (
            level === "DEBUG" ||
            type === "heartbeat" ||
            type === "poll" ||
            type === "tick"
        ) {

            return {
                tier: "RUNTIME",
                importance: 5,
                retention: "5_MINUTES",
                searchable: false,
                learnable: false
            };

        }

        // ----------------------------------------------------
        // Default
        // ----------------------------------------------------

        return {

            tier: "WORKING",

            importance: 50,

            retention: "1_DAY",

            searchable: true,

            learnable: false

        };

    }

}

export default new MemoryClassifier();
