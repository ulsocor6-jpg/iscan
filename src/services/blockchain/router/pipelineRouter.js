import { EventEmitter } from "events";

class PipelineRouter extends EventEmitter {

    constructor() {

        super();

        this.setMaxListeners(100);

    }

    /*
    |--------------------------------------------------------------------------
    | Blockchain Event Entry Point
    |--------------------------------------------------------------------------
    */

    route(event) {

        this.emit(
            "blockchain.observed",
            event
        );

    }

    /*
    |--------------------------------------------------------------------------
    | Operation Events
    |--------------------------------------------------------------------------
    */

    emitDeposit(operation, event) {

        this.emit(
            "deposit.job",
            {
                operation,
                event
            }
        );

    }

    emitWithdrawal(operation, event) {

        this.emit(
            "withdrawal.job",
            {
                operation,
                event
            }
        );

    }

    emitSwap(operation, event) {

        this.emit(
            "swap.job",
            {
                operation,
                event
            }
        );

    }

    emitUnknown(event) {

        this.emit(
            "unknown.event",
            event
        );

    }

}

export default new PipelineRouter();
