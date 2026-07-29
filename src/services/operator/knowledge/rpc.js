export default [

    {
        code: "RPC_TIMEOUT",

        title: "RPC Timeout",

        domain: "blockchain",

        component: "RPC Provider",

        pipeline: "BLOCKCHAIN",

        severity: "HIGH",

        confidence: 95,

        autoRemediation: true,

        playbook: "RPC_RETRY",

        notification: [
            "dashboard"
        ],

        affects: [
            "Blockchain Collectors",
            "Blockchain Watchers",
            "Executors"
        ],

        emits: [
            "incident.created",
            "rpc.timeout"
        ],

        recommendation:
            "Retry using a healthy RPC endpoint.",

        patterns: [
            "timeout",
            "request timeout",
            "rpc timeout"
        ]
    },

    {
        code: "RPC_UNAVAILABLE",

        title: "RPC Unavailable",

        domain: "blockchain",

        component: "RPC Provider",

        pipeline: "BLOCKCHAIN",

        severity: "CRITICAL",

        confidence: 97,

        autoRemediation: true,

        playbook: "RPC_FAILOVER",

        notification: [
            "telegram",
            "dashboard",
            "mission-control"
        ],

        affects: [
            "Collectors",
            "Executors",
            "Treasury",
            "Deposits",
            "Withdrawals"
        ],

        emits: [
            "incident.created",
            "rpc.offline"
        ],

        recommendation:
            "Switch to a backup RPC provider.",

        patterns: [
            "failed to fetch",
            "network error",
            "socket hang up",
            "econnreset",
            "connection refused"
        ]
    }

];
