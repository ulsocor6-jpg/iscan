class BalanceHistory {

    constructor() {

        this.history = [];

        this.maxEntries = 10000;

    }

    record(entry = {}) {

        const record = {

            id:
                `${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,

            timestamp:
                entry.timestamp || new Date(),

            channel:
                (entry.channel || "UNKNOWN").toUpperCase(),

            balance:
                Number(entry.balance || 0),

            available:
                Number(entry.available ?? entry.balance ?? 0),

            reserved:
                Number(entry.reserved || 0),

            pending:
                Number(entry.pending || 0),

            expected:
                Number(entry.expected || 0),

            variance:
                Number(entry.variance || 0),

            source:
                entry.source || "UNKNOWN",

            signature:
                entry.signature || null,

            reason:
                entry.reason || null

        };

        this.history.push(record);

        if (this.history.length > this.maxEntries) {

            this.history.shift();

        }

        return record;

    }

    latest(channel = null) {

        if (!channel) {

            return this.history.at(-1) || null;

        }

        channel = channel.toUpperCase();

        return [...this.history]
            .reverse()
            .find(r => r.channel === channel) || null;

    }

    byChannel(channel) {

        channel = channel.toUpperCase();

        return this.history.filter(

            r => r.channel === channel

        );

    }

    since(date) {

        const d = new Date(date);

        return this.history.filter(

            r => r.timestamp >= d

        );

    }

    all() {

        return [...this.history];

    }

    count() {

        return this.history.length;

    }

    clear() {

        this.history = [];

    }

}

export default new BalanceHistory();
