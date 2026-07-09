import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import consumerDispatcher from "../pipeline/consumerDispatcher.js";
import inspector from "../inspector/blockchainInspector.js";

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

        this.interval = setInterval(

            () => this.scan(),

            10000

        );

    }

    stop() {

        clearInterval(this.interval);

        this.running = false;

    }

    async scan() {

        try {

            const jobs = await BlockchainInbox.find({

                status: {

                    $nin: [

                        "COMPLETED",

                        "FAILED"

                    ]

                }

            });

            if (!jobs.length) {

                return;

            }

            inspector.info(

                "RecoveryWorker",

                `Recovered ${jobs.length} job(s)`,

                {}

            );

            for (const job of jobs) {

                consumerDispatcher.dispatch(job);

            }

        }

        catch (err) {

            inspector.error(

                "RecoveryWorker",

                err.message

            );

        }

    }

}

export default new RecoveryWorker();
