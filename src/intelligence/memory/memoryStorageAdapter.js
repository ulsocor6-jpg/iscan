class MemoryStorageAdapter {

    constructor() {

        this.adapters = new Map();

    }

    register(tier, adapter) {

        this.adapters.set(
            tier,
            adapter
        );

    }

    adapter(tier) {

        return this.adapters.get(tier);

    }

    async save(tier, key, memory) {

        const adapter =
            this.adapter(tier);

        if (!adapter?.save)
            return false;

        return await adapter.save(
            key,
            memory
        );

    }

    async load(tier, key) {

        const adapter =
            this.adapter(tier);

        if (!adapter?.load)
            return null;

        return await adapter.load(key);

    }

    async delete(tier, key) {

        const adapter =
            this.adapter(tier);

        if (!adapter?.delete)
            return false;

        return await adapter.delete(key);

    }

    tiers() {

        return [...this.adapters.keys()];

    }

}

export default new MemoryStorageAdapter();
