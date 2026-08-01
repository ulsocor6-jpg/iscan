class BalanceCache {

    constructor() {

        this.cache = new Map();

    }

    setBalance(channel, data = {}) {

        this.cache.set(channel.toUpperCase(), {

            channel: channel.toUpperCase(),

            balance: Number(data.balance || 0),

            available: Number(data.available ?? data.balance ?? 0),

            reserved: Number(data.reserved || 0),

            pending: Number(data.pending || 0),

            expected: Number(data.expected || 0),

            variance: Number(data.variance || 0),

            signature: data.signature || null,

            source: data.source || "UNKNOWN",

            observedAt: data.observedAt || new Date(),

            updatedAt: new Date()

        });

        return this.getBalance(channel);

    }

    getBalance(channel) {

        return this.cache.get(channel.toUpperCase()) || null;

    }

    has(channel) {

        return this.cache.has(channel.toUpperCase());

    }

    remove(channel) {

        return this.cache.delete(channel.toUpperCase());

    }

    clear() {

        this.cache.clear();

    }

    getSnapshot() {

        return Array.from(this.cache.values());

    }

    getAll() {

        return Object.fromEntries(this.cache);

    }

    getChannels() {

        return Array.from(this.cache.keys());

    }

    getHealth() {

        const now = Date.now();

        return this.getSnapshot().map(entry => ({

            channel: entry.channel,

            balance: entry.balance,

            variance: entry.variance,

            ageSeconds:

                Math.floor(

                    (now - new Date(entry.updatedAt).getTime()) / 1000

                ),

            healthy:

                Math.abs(entry.variance) === 0

        }));

    }

}

export default new BalanceCache();
