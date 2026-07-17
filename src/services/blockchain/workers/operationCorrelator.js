import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import PendingOperation from "../../../models/blockchain/pendingOperationModel.js";

import inspector from "../inspector/blockchainInspector.js";
import executorRouter from "../executors/executorRouter.js";

class OperationCorrelator {

    async process() {

        const jobs = await BlockchainInbox.find({

            status: "CONFIRMED",

            "workers.correlator.done": false

        });

        for (const job of jobs) {

            try {

                await this.processJob(job);

            }

            catch (err) {

                inspector.error(

                    "OperationCorrelator",

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
        ----------------------------------------------------
        Match Pending Operation
        ----------------------------------------------------
        */

        const pending = await PendingOperation.findOne({

            chain: (job.chain || "").toLowerCase(),

            txHash: job.txHash,

            status: "OPEN"

        });

        await BlockchainInbox.updateOne(

            {

                _id: job._id

            },

            {

                $set: {

                    "workers.correlator.done": true,

                    "workers.correlator.updatedAt": new Date()

                }

            }

        );

        if (!pending) {

            return;

        }

        /*
        ----------------------------------------------------
        Claim
        ----------------------------------------------------
        */

        const claimed = await PendingOperation.findOneAndUpdate(

            {

                _id: pending._id,

                status: "OPEN"

            },

            {

                $set: {

                    status: "PROCESSING",

                    claimedAt: new Date(),

                    blockchainInboxId: job._id

                }

            },

            {

                new: true

            }

        );

        if (!claimed) {

            return;

        }

        /*
        ----------------------------------------------------
        Execute
        ----------------------------------------------------
        */

        await executorRouter.dispatch(

            claimed.type,

            {

                pending: claimed,

                job

            }

        );

        /*
        ----------------------------------------------------
        Complete
        ----------------------------------------------------
        */

        claimed.status = "COMPLETED";

        claimed.completedAt = new Date();

        await claimed.save();

        /*
        ----------------------------------------------------
        Chain Next Operation
        ----------------------------------------------------
        */

        if (claimed.nextOperation) {

            await PendingOperation.create({

                type: claimed.nextOperation,

                chain: claimed.chain,

                referenceId: claimed.referenceId,

                token: claimed.token,

                metadata: claimed.metadata,

                status: "OPEN"

            });

            inspector.info(

                "Workflow",

                `Queued ${claimed.nextOperation}`,

                {

                    referenceId: claimed.referenceId

                }

            );

        }

        inspector.success(

            "OperationCorrelator",

            `${claimed.type} completed`,

            {

                referenceId: claimed.referenceId,

                txHash: claimed.txHash

            }

        );

    }

}

export default new OperationCorrelator();
