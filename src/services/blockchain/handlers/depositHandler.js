import blockchainInboxService from "../journal/blockchainInboxService.js";
import DepositAddress from "../../../models/depositAddressModel.js";

class DepositHandler {

    /*
    ===============================================

    Main Entry

    ===============================================
    */

    async handle(event) {

        /*
         * Step 1
         * Verify recipient belongs to ISCAN.
         */

        const address =
            await DepositAddress.findOne({

                address: event.to.toLowerCase(),

                status: "active"

            });

        if (!address) {

            console.log(

                "[DepositHandler] Ignored",

                event.to

            );

            return false;

        }

        console.log(

            "[DepositHandler] Matched",

            address.userId.toString()

        );

        /*
        ==================================================

        Future steps

        ==================================================

        1 Verify confirmations

        2 Create Deposit

        3 Credit Wallet

        4 Ledger Entry

        5 Emit Dashboard

        6 Settlement

        ==================================================
        */

        await blockchainInboxService.markProcessed(

            event._id,

            "deposit"

        );

        return true;

    }

}

export default new DepositHandler();
