export default {

    id: "DepositWatcher",

    capability: "Deposit Detection",

    mission: "AUTO_CREDIT",

    priority: "CRITICAL",

    businessPurpose:
        "Detect customer deposits entering supported wallets and blockchains.",

    customerImpact:
        "Customers cannot receive balances if deposits are not detected.",

    receives: [

        "Blockchain Transfer",

        "Bank Deposit",

        "E-Wallet Deposit"

    ],

    produces: [

        "deposit.detected"

    ],

    downstream: [

        "DepositVerifier"

    ],

    healthDefinition: {

        healthy:
            "New deposits are detected within expected polling interval.",

        degraded:
            "Detection delayed beyond polling SLA.",

        failed:
            "No deposits detected while upstream activity exists."

    },

    recovery: {

        automatic:
            "Replay missing blockchain blocks and payment provider history.",

        manual:
            "Operator verifies deposit then replays detection."

    },

    observability: {

        metrics: [

            "pollLatency",

            "blocksScanned",

            "depositsDetected",

            "providerFailures"

        ]

    }

};
