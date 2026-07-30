const autoCreditMission = {

    id: "AUTO_CREDIT",

    name: "Automatic Deposit Credit",

    description:
        "Credits verified deposits into customer wallets.",

    stages: [

        {
            id: "deposit.detected",
            component: "DepositWatcher"
        },

        {
            id: "deposit.verified",
            component: "DepositVerifier"
        },

        {
            id: "deposit.normalized",
            component: "TransactionNormalizer"
        },

        {
            id: "fx.applied",
            component: "FXEngine"
        },

        {
            id: "fee.applied",
            component: "FeeEngine"
        },

        {
            id: "ledger.posted",
            component: "Ledger"
        },

        {
            id: "treasury.updated",
            component: "Treasury"
        },

        {
            id: "wallet.credited",
            component: "WalletService"
        },

        {
            id: "notification.sent",
            component: "NotificationService"
        }

    ]

};

export default autoCreditMission;
