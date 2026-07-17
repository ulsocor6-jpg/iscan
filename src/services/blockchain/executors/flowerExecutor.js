import executorRouter from "./executorRouter.js";

import flowerStageHandlers from "../workers/flowerStageHandlers.js";

import {

    executeFlowerToUsdcSwap

} from "../../flower/flowerDexService.js";

import {

    settle

} from "../../flower/flowerSettlementService.js";

class FlowerExecutor {

    constructor(){

        this.started = false;

    }

    start(){

        if(this.started){

            return;

        }

        this.started = true;

        console.log("[FlowerExecutor] Started");

        executorRouter.on(

            "flower.sweep.execute",

            ({pending,job})=>

                this.executeSweep(

                    pending,

                    job

                )

        );

        executorRouter.on(

            "flower.swap.execute",

            ({pending,job})=>

                this.executeSwap(

                    pending,

                    job

                )

        );

        executorRouter.on(

            "flower.settle.execute",

            ({pending,job})=>

                this.executeSettle(

                    pending,

                    job

                )

        );

        executorRouter.on(

            "flower.reverse.execute",

            ({pending,job})=>

                this.executeReverse(

                    pending,

                    job

                )

        );

    }

    /*
    ----------------------------------------------------
    Sweep
    ----------------------------------------------------
    */

    async executeSweep(pending,job){

        await flowerStageHandlers.FLOWER_SWEEP(

            pending,

            job

        );

    }

    /*
    ----------------------------------------------------
    Swap
    ----------------------------------------------------
    */

    async executeSwap(pending,job){

        await flowerStageHandlers.FLOWER_SWAP(

            pending,

            job

        );

        const order = pending.referenceId;

        const amount = pending.actualAmount;

        const minOutputRaw = pending.metadata?.minOutputRaw;

        const result =
            await executeFlowerToUsdcSwap({

                orderId: order,

                amountIn: amount,

                minOutputRaw

            });

        console.log(

            "[FlowerExecutor] Swap complete",

            result.txHash

        );

    }

    /*
    ----------------------------------------------------
    Settlement
    ----------------------------------------------------
    */

    async executeSettle(pending,job){

        await flowerStageHandlers.FLOWER_SETTLE(

            pending,

            job

        );

        await settle(

            pending.referenceId

        );

    }

    /*
    ----------------------------------------------------
    Reverse
    ----------------------------------------------------
    */

    async executeReverse(pending,job){

        await flowerStageHandlers.FLOWER_REVERSE_SWAP(

            pending,

            job

        );

    }

}

export default new FlowerExecutor();
