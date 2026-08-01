import crypto from "crypto";

import balanceCache from "./balanceCache.js";
import balanceHistory from "./balanceHistory.js";

class TreasuryWatcher {

    update(channel, snapshot = {}) {

        channel = channel.toUpperCase();

        const signature = this.createSignature({

            channel,

            balance: snapshot.balance,

            available: snapshot.available,

            reserved: snapshot.reserved,

            pending: snapshot.pending,

            expected: snapshot.expected

        });

        const record = {

            channel,

            balance: Number(snapshot.balance || 0),

            available: Number(snapshot.available ?? snapshot.balance ?? 0),

            reserved: Number(snapshot.reserved || 0),

            pending: Number(snapshot.pending || 0),

            expected: Number(snapshot.expected || 0),

            variance:
                Number(snapshot.balance || 0) -
                Number(snapshot.expected || 0),

            source:
                snapshot.source || "LAPTOP",

            observedAt:
                snapshot.observedAt || new Date(),

            signature

        };

        balanceCache.setBalance(channel, record);

        balanceHistory.record(record);

        return record;

    }

    current(channel) {

        return balanceCache.getBalance(channel);

    }

    history(channel) {

        return balanceHistory.byChannel(channel);

    }

    health(channel) {

        const current = this.current(channel);

        if (!current) {

            return {

                healthy: false,

                reason: "NO_SNAPSHOT"

            };

        }

        return {

            healthy:
                current.variance === 0,

            variance:
                current.variance,

            signature:
                current.signature,

            observedAt:
                current.observedAt

        };

    }

    createSignature(data) {

        return crypto
            .createHash("sha256")
            .update(JSON.stringify(data))
            .digest("hex");

    }

}

export default new TreasuryWatcher();
