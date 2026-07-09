import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import Ledger from "../../../models/ledgerModel.js";
import inspector from "../inspector/blockchainInspector.js";

class LedgerWorker {

    async process() {

        const jobs = await BlockchainInbox.find({

            currentStage: "LedgerWorker",

            "workers.wallet.done": true,

            "workers.ledger.done": false

        });

        for (const job of jobs) {

            try {

                await this.processJob(job);

            } catch (err) {

                inspector.error(

                    "LedgerWorker",

                    err.message,

                    {

                        txHash: job.txHash

                    }

                );

            }

        }

    }

    async processJob(job) {

        const exists = await Ledger.findOne({

            referenceId: job.txHash

        });

        if (exists) {

            job.workers.ledger.done = true;

            job.currentStage = "DashboardWorker";

            await job.save();

            return;

        }

        await Ledger.create({

            userId: job.watch.userId,

            referenceId: job.txHash,

            // FIX: Ledger.transactionType enum only accepts lowercase
            // 'crypto_deposit' — 'CRYPTO_DEPOSIT' failed schema validation
            // on every single deposit, silently swallowed by the catch
            // block above, so no Ledger entry was ever actually created.
            transactionType: "crypto_deposit",

            currency: job.token,

            credit: Number(job.value),

            debit: 0,

            description: `Crypto deposit: ${job.value} ${job.token} on ${job.chain}`,

            counterpartyAddress: job.to,

            metadata: {

                chain: job.chain,

                blockNumber: job.blockNumber,

                confirmations: job.confirmations,

                fromAddress: job.from,

                toAddress: job.to

            }

        });

        job.workers.ledger.done = true;

        job.currentStage = "DashboardWorker";

        await job.save();

        inspector.success(

            "LedgerWorker",

            `Ledger entry created: ${job.value} ${job.token} credited`,

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

export default new LedgerWorker();
