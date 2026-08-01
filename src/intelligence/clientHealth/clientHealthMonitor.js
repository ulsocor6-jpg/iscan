import clientHealthRegistry from "./clientHealthRegistry.js";
import platformIntelligenceBus from "../platform/platformIntelligenceBus.js";

class ClientHealthMonitor {

    start(interval = 5000) {

        if (this.timer) return;

        this.timer = setInterval(() => {

            this.inspect();

        }, interval);

        console.log("[ClientHealthMonitor] Started");

    }

    inspect() {

        const now = Date.now();

        for (const client of clientHealthRegistry.snapshot()) {

            const age =
                now - new Date(client.lastSeen).getTime();

            if (age > 30000) {

                clientHealthRegistry.markOffline(
                    client.clientId
                );

                platformIntelligenceBus.publish({

                    type: "CLIENT_OFFLINE",

                    source: "ClientHealthMonitor",

                    severity: "WARNING",

                    clientId: client.clientId,

                    sessionId: client.sessionId,

                    userId: client.userId,

                    route: client.route,

                    age

                });

            }

        }

    }

}

export default new ClientHealthMonitor();
