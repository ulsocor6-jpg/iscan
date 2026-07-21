import { EventEmitter } from "events";
import brainBus from "../../../brainbus/brainBus.js";
import { Channels } from "../../../brainbus/channels.js";

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
        brainBus.emit(Channels.BLOCKCHAIN_EVENT, event, {
            source: "BlockchainInspector",
            correlationId: event.metadata?.flowId || event.metadata?.txHash || null
        });

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
        brainBus.emit(Channels.BLOCKCHAIN_EVENT_FAILED, {
            stage,
            message,
            metadata,
            timestamp: new Date()
        }, {
            source: "BlockchainInspector",
            correlationId: metadata?.flowId || metadata?.txHash || null
        });

        this.log(stage, "ERROR", message, metadata);

    }

}

export default new BlockchainInspector();
