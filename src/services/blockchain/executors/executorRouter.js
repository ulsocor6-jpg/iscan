import { EventEmitter } from "events";

class ExecutorRouter extends EventEmitter {

    constructor() {

        super();

        this.setMaxListeners(100);

    }

    /*
    |--------------------------------------------------------------------------
    | Dispatch
    |--------------------------------------------------------------------------
    */

    async dispatch(type, payload) {

        const event = this.resolveEvent(type);

        const listeners = this.listeners(event);

        if (!listeners.length) {

            throw new Error(

                `No executor registered for ${type}`

            );

        }

        for (const listener of listeners) {

            await listener(payload);

        }

    }

    /*
    |--------------------------------------------------------------------------
    | Resolve Event
    |--------------------------------------------------------------------------
    */

    resolveEvent(type) {

        switch ((type || "").toUpperCase()) {

            case "DEPOSIT":

                return "deposit.execute";

            case "WITHDRAWAL":

                return "withdrawal.execute";

            case "SWAP":

                return "swap.execute";

            case "FLOWER_SWEEP":

                return "flower.sweep.execute";

            case "FLOWER_SWAP":

                return "flower.swap.execute";

            case "FLOWER_SETTLE":

                return "flower.settle.execute";

            case "FLOWER_REVERSE_SWAP":

                return "flower.reverse.execute";

            default:

                throw new Error(

                    `Unknown executor type: ${type}`

                );

        }

    }

}

export default new ExecutorRouter();
