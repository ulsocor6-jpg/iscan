import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import consumerDispatcher from "./consumerDispatcher.js";
import inspector from "../inspector/blockchainInspector.js";

class TransactionPipeline {

    constructor() {

        this.started = false;

    }

    start() {

        if (this.started) return;

        this.started = true;

        console.log("[TransactionPipeline] Started");

        consumerDispatcher.on(

            "blockchain:event",

            this.route.bind(this)

        );

    }

    async route(event) {

        try {

            /*
            --------------------------------------------------------
            Every blockchain event enters the pipeline here.

            The inbox is the source of truth.

            We simply wake up the correct stage.

            --------------------------------------------------------
            */

            const inbox = await BlockchainInbox.findById(event._id);

            if (!inbox) {

                return;

            }

            switch (inbox.currentStage) {

                case "ConfirmationWorker":

                    consumerDispatcher.emit(
                        "worker:confirmation",
                        inbox
                    );

                    break;

                case "DepositProcessor":

                    consumerDispatcher.emit(
                        "worker:deposit",
                        inbox
                    );

                    break;

                case "WalletCreditWorker":

                    consumerDispatcher.emit(
                        "worker:wallet",
                        inbox
                    );

                    break;

                case "LedgerWorker":

                    consumerDispatcher.emit(
                        "worker:ledger",
                        inbox
                    );

                    break;

                case "DashboardWorker":

                    consumerDispatcher.emit(
                        "worker:dashboard",
                        inbox
                    );

                    break;

                default:

                    inspector.info(

                        "Pipeline",

                        `Idle at ${inbox.currentStage}`,

                        {

                            txHash: inbox.txHash

                        }

                    );

            }

        }

        catch (err) {

            inspector.error(

                "Pipeline",

                err.message

            );

        }

    }

}

export default new TransactionPipeline();
