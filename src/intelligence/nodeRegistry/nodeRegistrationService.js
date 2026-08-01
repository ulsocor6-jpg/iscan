import nodeRegistry from "./nodeRegistry.js";

class NodeRegistrationService {

    register(payload) {

        nodeRegistry.register(payload);

        return {
            success: true
        };

    }

}

export default new NodeRegistrationService();
