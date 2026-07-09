import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import inspector from "../inspector/blockchainInspector.js";

class DashboardWorker {

    async process() {

        const jobs = await BlockchainInbox.find({

            currentStage: "DashboardWorker",

            "workers.ledger.done": true,

            "workers.dashboard.done": false

        });

        for (const job of jobs) {

            try {

                await this.processJob(job);

            }

            catch (err) {

                inspector.error(

                    "DashboardWorker",

                    err.message,

                    {

                        txHash: job.txHash

                    }

                );

            }

        }

    }

    async processJob(job) {

        /*
        -------------------------------------------------
        Future:
        - websocket broadcast
        - dashboard cache
        - notifications
        - statistics
        -------------------------------------------------
        */

        job.workers.dashboard.done = true;

        job.currentStage = "Completed";

        await job.save();

        inspector.success(

            "DashboardWorker",

            "Pipeline completed",

            {

                txHash: job.txHash,

                userId: job.watch.userId

            }

        );

    }

}

export default new DashboardWorker();
