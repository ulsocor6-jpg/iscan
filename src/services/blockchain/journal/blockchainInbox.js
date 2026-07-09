import { EventEmitter } from "events";
import consumerDispatcher from "../pipeline/consumerDispatcher.js";
import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";

/**
 * ------------------------------------------------------------------
 * Internal Event Bus
 * ------------------------------------------------------------------
 */

export const blockchainInboxEvents = new EventEmitter();

// Allow many consumers without warnings.
blockchainInboxEvents.setMaxListeners(100);

/**
 * ------------------------------------------------------------------
 * Save blockchain event
 * ------------------------------------------------------------------
 */

export async function record(event) {
    try {

        const document = await BlockchainInbox.findOneAndUpdate(
            {
                chain: event.chain,
                txHash: event.txHash,
                logIndex: event.logIndex
            },
            {
                $setOnInsert: {
                    ...event,
                    status: event.status ?? "MATCHED",
                    currentStage: event.currentStage ?? "ConfirmationWorker",
                    confirmations: event.confirmations ?? 0,
                    requiredConfirmations: event.requiredConfirmations ?? 20,
                    workers: event.workers ?? {
                        deposit: {},
                        flower: {},
                        treasury: {},
                        settlement: {},
                        wallet: {},
                        ledger: {},
                        dashboard: {}
                    }
                }
            },
            {
                new: true,
                upsert: true
            }
        );

        blockchainInboxEvents.emit("new_event", document);

        blockchainInboxEvents.emit(
            `chain:${document.chain}`,
            document
        );

        blockchainInboxEvents.emit(
            `token:${document.token}`,
            document
        );

        return document;

    } catch (error) {

        // Ignore duplicate insert race condition.
        if (error.code === 11000) {

            return BlockchainInbox.findOne({
                chain: event.chain,
                txHash: event.txHash,
                logIndex: event.logIndex
            });

        }

        throw error;
    }
}

/**
 * ------------------------------------------------------------------
 * Mark worker complete
 * ------------------------------------------------------------------
 */

export async function markWorkerDone(id, worker) {

    return BlockchainInbox.findByIdAndUpdate(
        id,
        {
            $set: {
                [`workers.${worker}.done`]: true,
                [`workers.${worker}.updatedAt`]: new Date()
            }
        },
        {
            new: true
        }
    );

}

/**
 * ------------------------------------------------------------------
 * Mark worker error
 * ------------------------------------------------------------------
 */

export async function markWorkerError(id, worker, error) {

    return BlockchainInbox.findByIdAndUpdate(
        id,
        {
            $set: {
                [`workers.${worker}.error`]: error.message,
                [`workers.${worker}.updatedAt`]: new Date()
            }
        },
        {
            new: true
        }
    );

}

/**
 * ------------------------------------------------------------------
 * Pending events
 * ------------------------------------------------------------------
 */

export async function pending(worker) {

    return BlockchainInbox.find({
        [`workers.${worker}.done`]: false
    }).sort({
        blockNumber: 1,
        logIndex: 1
    });

}

/**
 * ------------------------------------------------------------------
 * Inbox Statistics
 * ------------------------------------------------------------------
 */

export async function stats() {

    const total = await BlockchainInbox.countDocuments();

    const newest = await BlockchainInbox.findOne()
        .sort({
            blockNumber: -1
        });

    return {
        total,
        latestBlock: newest?.blockNumber ?? 0
    };

}
