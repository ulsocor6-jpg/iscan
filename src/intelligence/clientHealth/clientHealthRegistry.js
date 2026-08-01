class ClientHealthRegistry {

    constructor() {

        this.clients = new Map();

    }

    heartbeat(clientId, data = {}) {

        this.clients.set(clientId, {

            ...(this.clients.get(clientId) || {}),

            ...data,

            clientId,

            lastSeen: new Date(),

            status: "ONLINE"

        });

    }

    update(clientId, partial = {}) {

        const current = this.clients.get(clientId) || {};

        this.clients.set(clientId, {

            ...current,

            ...partial,

            clientId

        });

    }

    markOffline(clientId) {

        this.update(clientId, {

            status: "OFFLINE"

        });

    }

    snapshot() {

        const now = Date.now();

        return [...this.clients.values()].map(client => ({

            ...client,

            secondsSinceHeartbeat:
                Math.floor(
                    (now - new Date(client.lastSeen).getTime()) / 1000
                )

        }));

    }

}

export default new ClientHealthRegistry();
