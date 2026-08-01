import clientHealthRegistry from "./clientHealthRegistry.js";

class ClientSnapshotService {

    getSnapshot() {

        return {

            generatedAt: new Date().toISOString(),

            clients: clientHealthRegistry.snapshot()

        };

    }

}

export default new ClientSnapshotService();
