import consumerDispatcher from "../pipeline/consumerDispatcher.js";
import blockchainInboxService from "../journal/blockchainInboxService.js";

class DepositConsumer {

    start() {

        console.log("[DepositConsumer] Listening...");

        consumerDispatcher.on(

            "deposit",

            this.process.bind(this)

        );

    }

    async process(event) {

        try {

            console.log(

                "[Deposit]",

                event.chain,

                event.token,

                event.amount,

                event.to

            );

            await blockchainInboxService.markProcessed(

                event._id,

                "deposit"

            );

        }

        catch(err){

            console.error(err);

        }

    }

}

export default new DepositConsumer();
