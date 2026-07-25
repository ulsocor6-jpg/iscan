// src/intelligence/systemKnowledge.js

class SystemKnowledge {

    constructor() {

        this.pipelines = {

            WITHDRAWAL: {

                description:
                    "Processes a withdrawal from ledger debit through treasury send to final settlement.",

                entryStages: [],

                stages: [
                    "DEBIT",
                    "SEND"
                ],

                terminalExits: [
                    "CANCELLED",
                    "FAILED"
                ]

            },

            FLOWER_SWAP: {

                description:
                    "Swaps FLOWER tokens to USDC via the DEX. Stages: sweep FLOWER from forwarder, swap on Katana, settle USDC to treasury.",

                entryStages: [],

                stages: [
                    "FLOWER_SWEEP",
                    "FLOWER_SWAP",
                    "FLOWER_SETTLE"
                ],

                terminalExits: [
                    "CANCELLED",
                    "FAILED"
                ]

            },

            PHP_DEPOSIT: {

                description:
                    "Processes a PHP deposit into a credited wallet. May enter via a direct deposit request (DEPOSIT_REQUESTED), a bank/e-wallet notification (WATCHER), or both on the same flow if a direct request is later matched to an incoming notification.",

                // Optional — may appear 0, 1, or both, in this relative order.
                // Absence is never a deviation on its own.
                entryStages: [
                    "DEPOSIT_REQUESTED",
                    "WATCHER"
                ],

                // Required — once the flow is past its entry stage(s), these
                // must appear in this order for the flow to be considered
                // on-track. A gap here (a later required stage present
                // without an earlier one) is a real deviation.
                stages: [
                    "DEDUP",
                    "PROCESS_TRANSACTION",
                    "PARSER",
                    "USER_LOOKUP",
                    "DEPOSIT_MATCH",
                    "VERIFIER",
                    "LEDGER",
                    "WALLET",
                    "EVENT_STREAM"
                ],

                // Valid terminal states that end a flow outside the normal
                // success path — not a deviation if present.
                terminalExits: [
                    "CANCELLED"
                ]

            },

            // NEW — settleStablecoinToPHP() in phpSettlementService.js.
            // User's on-chain USDC/USDT -> platform treasury -> PHP ledger credit.
            // Stage names match the actual inspector.*() step labels already
            // logged in that function (see "step:" metadata in each call),
            // so this reads directly off existing log lines with no
            // renaming needed on the logging side.
            STABLECOIN_TO_PHP: {

                description:
                    "Converts a user's on-chain USDC/USDT to PHP. Verifies live on-chain balance, sweeps the stablecoin to treasury, then credits PHP to the user's ledger only after the sweep is confirmed.",

                entryStages: [],

                stages: [
                    "BALANCE_CHECK",
                    "SWEEP",
                    "SWEEP_CONFIRM",
                    "SETTLE"
                ],

                terminalExits: [
                    "CANCELLED",
                    "FAILED"
                ]

            },

            // NEW — settlePHPToStablecoin() in phpSettlementService.js.
            // User's PHP ledger balance -> debit -> treasury sends real
            // USDC/USDT out to the user's on-chain address -> settle.
            PHP_TO_STABLECOIN: {

                description:
                    "Converts a user's PHP ledger balance to USDC/USDT. Debits PHP first, then sends the stablecoin from treasury to the user's on-chain address, then settles pool balances.",

                entryStages: [],

                stages: [
                    "DEBIT",
                    "SEND",
                    "SETTLE"
                ],

                terminalExits: [
                    "CANCELLED",
                    "FAILED"
                ]

            }

        };

    }

    getPipeline(name) {
        return this.pipelines[name] || null;
    }

    getExpectedStages(name) {
        const pipeline = this.getPipeline(name);
        return pipeline ? pipeline.stages : [];
    }

    getEntryStages(name) {
        const pipeline = this.getPipeline(name);
        return pipeline ? pipeline.entryStages : [];
    }

    isTerminalExit(name, stageName) {
        const pipeline = this.getPipeline(name);
        return pipeline ? pipeline.terminalExits.includes(stageName) : false;
    }

    // Full ordered sequence: entry stages (optional) + required tail.
    // Used by Reasoning to find "how far did this flow get" positionally.
    getFullSequence(name) {
        const pipeline = this.getPipeline(name);
        if (!pipeline) return [];
        return [...pipeline.entryStages, ...pipeline.stages];
    }

}

export default new SystemKnowledge();
