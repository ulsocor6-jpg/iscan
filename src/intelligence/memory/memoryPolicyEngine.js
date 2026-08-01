class MemoryPolicyEngine {

    constructor() {

        this.policies = {

            "5_MINUTES": 5 * 60 * 1000,

            "1_HOUR": 60 * 60 * 1000,

            "1_DAY": 24 * 60 * 60 * 1000,

            "MISSION": null,

            "SESSION": null,

            "LONG_TERM": null,

            "PERMANENT": null

        };

    }

    expiresAt(memory) {

        const retention =
            memory.memory.retention;

        const ttl =
            this.policies[retention];

        if (ttl == null)
            return null;

        return memory.createdAt + ttl;

    }

    expired(memory) {

        const expiry =
            this.expiresAt(memory);

        if (expiry == null)
            return false;

        return Date.now() >= expiry;

    }

    shouldKeep(memory) {

        return !this.expired(memory);

    }

    retentionList() {

        return Object.keys(this.policies);

    }

}

export default new MemoryPolicyEngine();
