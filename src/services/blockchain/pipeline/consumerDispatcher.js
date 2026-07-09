import { EventEmitter } from "events";

import {
    blockchainInboxEvents
} from "../journal/blockchainInbox.js";

class ConsumerDispatcher extends EventEmitter {

    constructor() {

        super();

        this.started = false;

        this.setMaxListeners(100);

    }

    start() {

        if (this.started) {

            return;

        }

        this.started = true;

        console.log("[ConsumerDispatcher] Started");

        blockchainInboxEvents.on(

            "new_event",

            (event) => {

                this.dispatch(event);

            }

        );

    }

    dispatch(event) {

        /*
        ----------------------------------------
        Single entry point into the pipeline.
        ----------------------------------------
        */

        this.emit(

            "blockchain:event",

            event

        );

    }

}

export default new ConsumerDispatcher();
