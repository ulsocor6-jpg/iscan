import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import Deposit from "../../../models/depositModel.js";
import inspector from "../inspector/blockchainInspector.js";

class DepositProcessor {

    async process() {

        const jobs = await BlockchainInbox.find({

            status: "CONFIRMED",

            "workers.deposit.done": false

        });

        for (const job of jobs) {

            try {

                await this.processJob(job);

            }

            catch (err) {

                inspector.error(

                    "DepositProcessor",

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
        ----------------------------------
        Prevent duplicates
        ----------------------------------
        */

        const exists = await Deposit.findOne({

            txHash: job.txHash

        });

        if (exists) {

            job.workers.deposit.done = true;

            job.currentStage =

                "WalletCreditWorker";

            await job.save();

            return;

        }

        /*
        ----------------------------------
        Create internal deposit
        ----------------------------------
        */

        await Deposit.create({

            userId: job.watch.userId,

            chain: job.chain,

            token: job.token,

            amount: job.value,

            txHash: job.txHash,

            address: job.to,

            blockNumber: job.blockNumber,

            confirmations: job.confirmations,

            status: "PENDING"

        });

        job.workers.deposit.done = true;

        job.processingStartedAt = new Date();

        job.currentStage =

            "WalletCreditWorker";

        await job.save();

        inspector.success(

            "DepositProcessor",

            `Deposit created: ${job.value} ${job.token} on ${job.chain} to ${job.to}`,

            {

                txHash: job.txHash,

                userId: job.watch.userId,

                amount: job.value,

                token: job.token,

                chain: job.chain,

                to: job.to

            }

        );

    }

}

export default new DepositProcessor();
