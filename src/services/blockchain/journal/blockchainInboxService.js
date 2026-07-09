import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";

class BlockchainInboxService {

    /*
    --------------------------------------------------
    Fetch pending inbox events
    --------------------------------------------------
    */

    async getPending(limit = 100) {

        return BlockchainInbox.find({

            status: "pending"

        })
        .sort({

            blockNumber: 1,

            logIndex: 1

        })
        .limit(limit)
        .lean();

    }

    /*
    --------------------------------------------------
    Fetch pending for one chain
    --------------------------------------------------
    */

    async getPendingByChain(chain, limit = 100) {

        return BlockchainInbox.find({

            chain,

            status: "pending"

        })
        .sort({

            blockNumber: 1,

            logIndex: 1

        })
        .limit(limit)
        .lean();

    }

    /*
    --------------------------------------------------
    Fetch pending for one consumer
    --------------------------------------------------
    */

    async getPendingForConsumer(consumer, limit = 100) {

        return BlockchainInbox.find({

            status: "pending",

            consumers: {

                $ne: consumer

            }

        })
        .sort({

            blockNumber: 1,

            logIndex: 1

        })
        .limit(limit);

    }

    /*
    --------------------------------------------------
    Consumer processed event
    --------------------------------------------------
    */

    async markProcessed(id, consumer) {

        return BlockchainInbox.updateOne(

            {

                _id: id

            },

            {

                $addToSet: {

                    consumers: consumer

                }

            }

        );

    }

    /*
    --------------------------------------------------
    Mark completed
    --------------------------------------------------
    */

    async complete(id) {

        return BlockchainInbox.updateOne(

            {

                _id: id

            },

            {

                $set: {

                    status: "processed",

                    processedAt: new Date()

                }

            }

        );

    }

    /*
    --------------------------------------------------
    Mark failed
    --------------------------------------------------
    */

    async fail(id, error) {

        return BlockchainInbox.updateOne(

            {

                _id: id

            },

            {

                $inc: {

                    retryCount: 1

                },

                $set: {

                    status: "failed",

                    lastError: error,

                    updatedAt: new Date()

                }

            }

        );

    }

    /*
    --------------------------------------------------
    Retry failed
    --------------------------------------------------
    */

    async requeue(id) {

        return BlockchainInbox.updateOne(

            {

                _id: id

            },

            {

                $set: {

                    status: "pending"

                }

            }

        );

    }

    /*
    --------------------------------------------------
    Find transaction
    --------------------------------------------------
    */

    async findByHash(hash) {

        return BlockchainInbox.findOne({

            txHash: hash

        });

    }

    /*
    --------------------------------------------------
    Stats
    --------------------------------------------------
    */

    async stats() {

        const [

            pending,

            processed,

            failed

        ] = await Promise.all([

            BlockchainInbox.countDocuments({

                status: "pending"

            }),

            BlockchainInbox.countDocuments({

                status: "processed"

            }),

            BlockchainInbox.countDocuments({

                status: "failed"

            })

        ]);

        return {

            pending,

            processed,

            failed

        };

    }

}

export default new BlockchainInboxService();
