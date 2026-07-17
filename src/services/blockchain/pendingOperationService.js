import PendingOperation from "../../models/blockchain/pendingOperationModel.js";

/*
|--------------------------------------------------------------------------
| Register Pending Operation
|--------------------------------------------------------------------------
*/

export async function recordPendingOperation({

    type,

    chain,

    txHash,

    expectedAddress = null,

    token = null,

    referenceId = null,

    metadata = {}

}) {

    if (!type || !chain || !txHash) {

        throw new Error(

            "recordPendingOperation requires type, chain and txHash"

        );

    }

    return PendingOperation.findOneAndUpdate(

        {

            chain: chain.toLowerCase(),

            txHash

        },

        {

            $setOnInsert: {

                type,

                chain: chain.toLowerCase(),

                txHash,

                expectedAddress:

                    expectedAddress

                        ? expectedAddress.toLowerCase()

                        : null,

                token,

                referenceId,

                metadata,

                status: "OPEN",

                retryCount: 0,

                actualAmount: null,

                lastError: null,

                claimedAt: null,

                completedAt: null

            }

        },

        {

            upsert: true,

            new: true

        }

    );

}

/*
|--------------------------------------------------------------------------
| Update Actual Amount
|--------------------------------------------------------------------------
*/

export async function setPendingOperationAmount({

    chain,

    txHash,

    actualAmount

}) {

    return PendingOperation.findOneAndUpdate(

        {

            chain: chain.toLowerCase(),

            txHash

        },

        {

            $set: {

                actualAmount

            }

        },

        {

            new: true

        }

    );

}

/*
|--------------------------------------------------------------------------
| Fail Operation
|--------------------------------------------------------------------------
*/

export async function failPendingOperation({

    chain,

    txHash,

    error

}) {

    return PendingOperation.findOneAndUpdate(

        {

            chain: chain.toLowerCase(),

            txHash

        },

        {

            $set: {

                status: "FAILED",

                lastError: error,

                completedAt: new Date()

            },

            $inc: {

                retryCount: 1

            }

        },

        {

            new: true

        }

    );

}

export default {

    recordPendingOperation,

    setPendingOperationAmount,

    failPendingOperation

};
