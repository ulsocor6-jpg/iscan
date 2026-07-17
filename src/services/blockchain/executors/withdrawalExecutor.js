import executorRouter from "./executorRouter.js";

class WithdrawalExecutor {

    constructor() {

        this.started = false;

    }

    start() {

        if (this.started) return;

        this.started = true;

        console.log("[WithdrawalExecutor] Started");

        executorRouter.on(

            "withdrawal.execute",

            this.execute.bind(this)

        );

    }

    /*
    |--------------------------------------------------------------------------
    | Execute Withdrawal
    |--------------------------------------------------------------------------
    */

    async execute({

        pending,

        job

    }) {

        try {

            console.log(

                "[WithdrawalExecutor]",

                pending.referenceId,

                job.txHash

            );

            /*
            -----------------------------------------------------

            TODO

            Move existing withdrawal logic here.

            Responsibilities:

            - verify blockchain confirmation
            - complete withdrawal
            - update wallet
            - write ledger
            - notify customer

            -----------------------------------------------------
            */

        }

        catch(err){

            console.error(

                "[WithdrawalExecutor]",

                err

            );

        }

    }

}

export default new WithdrawalExecutor();
