import { EventEmitter } from "events";

class BlockchainInspector extends EventEmitter {

    log(stage, level, message, metadata = {}) {

        const event = {

            timestamp: new Date(),

            stage,

            level,

            message,

            metadata

        };

        this.emit("event", event);

    }

    info(stage, message, metadata = {}) {

        this.log(stage, "INFO", message, metadata);

    }

    success(stage, message, metadata = {}) {

        this.log(stage, "SUCCESS", message, metadata);

    }

    warn(stage, message, metadata = {}) {

        this.log(stage, "WARNING", message, metadata);

    }

    error(stage, message, metadata = {}) {

        this.log(stage, "ERROR", message, metadata);

    }

}

export default new BlockchainInspector();
