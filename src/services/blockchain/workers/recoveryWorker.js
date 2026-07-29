import brainBus from "../../../brainbus/brainBus.js";
import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import consumerDispatcher from "../pipeline/consumerDispatcher.js";
import inspector from "../inspector/blockchainInspector.js";
import healthRegistry from "../../../intelligence/healthRegistry.js";

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

        healthRegistry.registerNode({ node: "recoveryWorker", type: "watcher" });
        healthRegistry.report({ node: "recoveryWorker", status: "ONLINE" });

        // Event‑driven – wakes on deposit, withdrawal, or swap
        brainBus.on("deposit.created",   () => this.scan());
        brainBus.on("withdrawal.started", () => this.scan());
        brainBus.on("swap.created",       () => this.scan());
        // Run once immediately to catch any pending work
        this.scan();

    }

    stop() {

        clearInterval(this.interval);

        this.running = false;

    }

    async scan() {

        try {

            healthRegistry.report({ node: "recoveryWorker", status: "ONLINE", metrics: { lastScanAt: new Date() } });

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

            healthRegistry.report({ node: "recoveryWorker", status: "WARNING", error: err.message });

        }

    }

}

export default new RecoveryWorker();
