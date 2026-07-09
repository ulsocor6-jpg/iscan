import blockchainInboxService from "../journal/blockchainInboxService.js";
import transactionPipeline from "./transactionPipeline.js";

class RecoveryWorker {

    constructor() {

        this.interval = null;

        this.running = false;

    }

    start() {

        if (this.running) {

            return;

        }

        this.running = true;

        console.log("[RecoveryWorker] Started");

        /*
         * Give the server time to boot before replaying.
         */
        setTimeout(() => {

            this.recover().catch(console.error);

        }, 5000);

        this.interval = setInterval(() => {

            this.recover().catch(console.error);

        }, 10000);

    }

    stop() {

        clearInterval(this.interval);

        this.running = false;

    }

    async recover() {

        const events = await blockchainInboxService.getPending(100);

        if (!events.length) {

            return;

        }

        console.log(

            `[RecoveryWorker] Replaying ${events.length} event(s)`

        );

        for (const event of events) {

            try {

                await transactionPipeline.route(event);

            }

            catch (err) {

                console.error(

                    "[RecoveryWorker]",

                    err.message

                );

            }

        }

    }

}

export default new RecoveryWorker();
