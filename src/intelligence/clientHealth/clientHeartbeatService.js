import clientHealthRegistry from "./clientHealthRegistry.js";

class ClientHeartbeatService {

    receive(payload = {}) {

        const clientId =
            payload.clientId ||
            payload.sessionId ||
            payload.userId;

        if (!clientId) {

            throw new Error("clientId is required");

        }

        clientHealthRegistry.heartbeat(clientId, {

            sessionId: payload.sessionId,

            userId: payload.userId,

            route: payload.route,

            screen: payload.screen,

            version: payload.version,

            websocket: payload.websocket,

            network: payload.network,

            latency: payload.latency,

            memoryMB: payload.memoryMB,

            cpu: payload.cpu,

            visibility: payload.visibility,

            loading: payload.loading,

            javascriptErrors: payload.javascriptErrors,

            battery: payload.battery,

            lastAction: payload.lastAction,

            currentFlow: payload.currentFlow

        });

        return {

            success: true

        };

    }

}

export default new ClientHeartbeatService();
