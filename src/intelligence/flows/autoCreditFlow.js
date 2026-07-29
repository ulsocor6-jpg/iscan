export default {

    id: "auto_credit",

    name: "Automatic Deposit Credit",

    description:
        "Credits a successful customer deposit into the internal ledger.",

    stages: [

        {
            id: "deposit_request",
            service: "Android",
            publishes: "deposit.requested",
            next: "pending_operation"
        },

        {
            id: "pending_operation",
            service: "PendingOperation",
            consumes: "deposit.requested",
            publishes: "operation.created",
            next: "deposit_verifier"
        },

        {
            id: "deposit_verifier",
            service: "DepositVerifier",
            consumes: "operation.created",
            publishes: "deposit.verified",
            next: "ledger"
        },

        {
            id: "ledger",
            service: "Ledger",
            consumes: "deposit.verified",
            publishes: "ledger.entry.created",
            next: "settlement"
        },

        {
            id: "settlement",
            service: "Settlement",
            consumes: "ledger.entry.created",
            publishes: "settlement.completed",
            next: "treasury"
        },

        {
            id: "treasury",
            service: "Treasury",
            consumes: "settlement.completed",
            publishes: "treasury.updated",
            next: "wallet"
        },

        {
            id: "wallet",
            service: "WalletBalanceSync",
            consumes: "treasury.updated",
            publishes: "wallet.updated",
            next: "frontend"
        },

        {
            id: "frontend",
            service: "Frontend",
            consumes: "wallet.updated",
            publishes: "deposit.completed"
        }

    ]

};
