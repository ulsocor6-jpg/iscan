import consensusVerificationService from "./consensusVerificationService.js";

class CreditAuthorizationEngine {

    async authorize({

        deposit,

        watcher,

        observedBalance,

        laptopVerified = false

    }) {

        const consensus =
            await consensusVerificationService.verify({

                deposit,

                watcher,

                observedBalance,

                laptopVerified

            });

        const authorization = {

            timestamp: new Date(),

            authorized: false,

            decision: "MANUAL_REVIEW",

            consensus,

            reasons: [...consensus.reasons]

        };

        switch (consensus.decision) {

            case "PASS":

                authorization.authorized = true;
                authorization.decision = "AUTO_CREDIT";
                break;

            case "REVIEW":

                authorization.decision = "MANUAL_REVIEW";
                break;

            case "FAIL":

                authorization.decision = "REJECT";
                break;

            default:

                authorization.decision = "MANUAL_REVIEW";

        }

        return authorization;

    }

}

export default new CreditAuthorizationEngine();
