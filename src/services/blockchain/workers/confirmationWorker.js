import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import BlockchainCursor from "../../../models/blockchain/blockchainCursorModel.js";
import inspector from "../inspector/blockchainInspector.js";

class ConfirmationWorker {

    async process() {

        const jobs = await BlockchainInbox.find({

            status: "MATCHED"

        });

        for (const job of jobs) {

            await this.processJob(job);

        }

    }

    async processJob(job) {

        const cursor = await BlockchainCursor.findOne({

            chain: job.chain

        });

        if (!cursor) {

            inspector.warn(

                "ConfirmationWorker",

                "Cursor not found",

                {

                    chain: job.chain

                }

            );

            return;

        }

        const latestBlock = cursor.lastScannedBlock;

        const confirmations =

            Math.max(

                0,

                latestBlock - job.blockNumber + 1

            );

        job.confirmations = confirmations;

        if (

            confirmations >=

            job.requiredConfirmations

        ) {

            job.status = "CONFIRMED";

            job.currentStage =

                "DepositProcessor";

            job.confirmedAt =

                new Date();

            inspector.success(

                "ConfirmationWorker",

                "Deposit confirmed",

                {

                    txHash: job.txHash,

                    confirmations

                }

            );

        }

        else {

            inspector.info(

                "ConfirmationWorker",

                `${confirmations}/${job.requiredConfirmations}`,

                {

                    txHash: job.txHash

                }

            );

        }

        await job.save();

    }

}

export default new ConfirmationWorker();
