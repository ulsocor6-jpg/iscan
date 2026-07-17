import executorRouter from "./executorRouter.js";

class SwapExecutor {

    constructor() {

        this.started = false;

    }

    start() {

        if (this.started) return;

        this.started = true;

        console.log("[SwapExecutor] Started");

        executorRouter.on(

            "swap.execute",

            this.execute.bind(this)

        );

    }

    /*
    |--------------------------------------------------------------------------
    | Execute Swap
    |--------------------------------------------------------------------------
    */

    async execute({

        pending,

        job

    }) {

        try {

            console.log(

                "[SwapExecutor]",

                pending.referenceId,

                job.txHash

            );

            /*
            -----------------------------------------------------

            TODO

            Move swap settlement here.

            Responsibilities:

            - debit source asset
            - credit destination asset
            - execute FX
            - apply fees
            - write ledger
            - notify customer

            -----------------------------------------------------
            */

        }

        catch(err){

            console.error(

                "[SwapExecutor]",

                err

            );

        }

    }

}

export default new SwapExecutor();
