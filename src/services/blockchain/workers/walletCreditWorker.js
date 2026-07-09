import BlockchainInbox from "../../../models/blockchain/blockchainInboxModel.js";
import Wallet from "../../../models/walletModel.js";
import inspector from "../inspector/blockchainInspector.js";

class WalletCreditWorker {

    async process() {

        const jobs = await BlockchainInbox.find({

            "workers.deposit.done": true,

            "workers.wallet.done": false

        });

        for (const job of jobs) {

            try {

                await this.processJob(job);

            }

            catch (err) {

                inspector.error(

                    "WalletCreditWorker",

                    err.message,

                    {

                        txHash: job.txHash

                    }

                );

            }

        }

    }

    async processJob(job) {

        const wallet = await Wallet.findOne({

            userId: job.watch.userId

        });

        if (!wallet) {

            throw new Error("Wallet not found");

        }

        /*
        -------------------------------------
        Credit balance
        -------------------------------------
        */

        const amount = Number(job.value);

        switch (job.token) {

            case "USDC":

                wallet.usdcBalance =
                    (wallet.usdcBalance || 0) + amount;

                break;

            case "USDT":

                wallet.usdtBalance =
                    (wallet.usdtBalance || 0) + amount;

                break;

            default:

                // FIX: previously fell through to a no-op, so FLOWER
                // (and any other non-USDC/USDT token) was detected,
                // confirmed, and recorded in Deposit/Ledger — but the
                // user's actual spendable balance never increased.
                // Credit it into the generic balances Map using the
                // established `${asset}-${chain}` key convention.
                {
                    const key = `${job.token}-${job.chain}`;
                    const current = wallet.balances.get(key) || 0;
                    wallet.balances.set(key, current + amount);
                }

                break;

        }

        await wallet.save();

        job.currentStage = "LedgerWorker";

        // FIX: this worker credits the WALLET, so it must mark the
        // "wallet" flag done — not "ledger". LedgerWorker's own query
        // waits on workers.wallet.done === true, so setting the wrong
        // flag here silently stalled every deposit before it ever
        // reached Ledger (and therefore Activity/transactionRoutes).
        job.workers.wallet.done = true;

        job.creditedAt = new Date();

        await job.save();

        inspector.success(

            "WalletCreditWorker",

            `Wallet credited: ${job.value} ${job.token} on ${job.chain}`,

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

export default new WalletCreditWorker();
