import mongoose from "mongoose";

import Deposit from "../../../models/depositModel.js";
import Wallet from "../../../models/walletModel.js";
import Ledger from "../../../models/ledgerModel.js";

import executorRouter from "./executorRouter.js";
import inspector from "../inspector/blockchainInspector.js";
import activeDepositSessions from "../watch/activeDepositSessions.js";

class DepositExecutor {

    constructor() {

        this.started = false;

    }

    start() {

        if (this.started) return;

        this.started = true;

        console.log("[DepositExecutor] Started");

        executorRouter.on(
            "deposit.execute",
            this.execute.bind(this)
        );

    }

    async execute({ pending, job }) {

        const session = await mongoose.startSession();

        try {

            session.startTransaction();

            /*
            --------------------------------------------------------
            Deposit
            --------------------------------------------------------
            */

            let deposit = await Deposit.findOne({

                txHash: job.txHash

            }).session(session);

            if (!deposit) {

                const created = await Deposit.create(
                [
                    {
                        userId: job.watch.userId,

                        chain: job.chain,

                        token: job.token,

                        amount: job.value,

                        txHash: job.txHash,

                        address: job.to,

                        blockNumber: job.blockNumber,

                        confirmations: job.confirmations,

                        status: "PROCESSING"

                    }
                ],
                {
                    session
                });

                deposit = created[0];

            }

            /*
            --------------------------------------------------------
            Wallet
            --------------------------------------------------------
            */

            const wallet = await Wallet.findOne({

                userId: job.watch.userId

            }).session(session);

            if (!wallet) {

                throw new Error("Wallet not found");

            }

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

                    {

                        const key =
                            `${job.token}-${job.chain}`;

                        const current =
                            wallet.balances.get(key) || 0;

                        wallet.balances.set(

                            key,

                            current + amount

                        );

                    }

            }

            await wallet.save({

                session

            });

            /*
            --------------------------------------------------------
            Ledger
            --------------------------------------------------------
            */

            const ledgerExists =
                await Ledger.findOne({

                    referenceId: job.txHash

                }).session(session);

            if (!ledgerExists) {

                await Ledger.create(
                [
                    {

                        userId: job.watch.userId,

                        referenceId: job.txHash,

                        transactionType: "crypto_deposit",

                        currency: job.token,

                        credit: amount,

                        debit: 0,

                        description:
                            `Crypto deposit: ${job.value} ${job.token} on ${job.chain}`,

                        counterpartyAddress: job.to,

                        metadata: {

                            chain: job.chain,

                            blockNumber: job.blockNumber,

                            confirmations: job.confirmations,

                            fromAddress: job.from,

                            toAddress: job.to

                        }

                    }
                ],
                {
                    session
                });

            }

            /*
            --------------------------------------------------------
            Complete Deposit
            --------------------------------------------------------
            */

            deposit.status = "COMPLETED";

            deposit.completedAt = new Date();

            await deposit.save({

                session

            });

            /*
            --------------------------------------------------------
            Complete Pending Operation
            --------------------------------------------------------
            */

            if (pending) {

                pending.status = "COMPLETED";

                pending.completedAt = new Date();

                await pending.save({

                    session

                });

            }

            /*
            --------------------------------------------------------
            Commit
            --------------------------------------------------------
            */

            await session.commitTransaction();

            activeDepositSessions.clear(

                job.chain,

                `${job.watch.userId}:${job.to}`

            );

            inspector.success(

                "DepositExecutor",

                "Deposit completed",

                {

                    txHash: job.txHash,

                    amount,

                    token: job.token,

                    userId: job.watch.userId

                }

            );

        }

        catch (err) {

            await session.abortTransaction();

            inspector.error(

                "DepositExecutor",

                err.message,

                {

                    txHash: job.txHash

                }

            );

        }

        finally {

            await session.endSession();

        }

    }

}

export default new DepositExecutor();
