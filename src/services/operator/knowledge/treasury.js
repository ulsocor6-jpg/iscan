export default [

    {
        code: "TREASURY_DEADLOCK",

        title: "Treasury Deadlock",

        domain: "treasury",

        component: "Treasury Balancer",

        pipeline: "TREASURY",

        severity: "CRITICAL",

        confidence: 100,

        autoRemediation: false,

        playbook: "TREASURY_REFILL",

        notification: [
            "telegram",
            "dashboard",
            "mission-control"
        ],

        affects: [
            "Withdrawals",
            "PHP Settlement",
            "Crypto Settlement"
        ],

        emits: [
            "incident.created",
            "treasury.deadlock"
        ],

        recommendation:
            "Inject liquidity immediately.",

        match(event) {
            return (
                event.stage === "treasury" &&
                event.metadata?.status === "DEADLOCK"
            );
        }
    },

    {
        code: "TREASURY_CRITICAL",

        title: "Treasury Critically Low",

        domain: "treasury",

        component: "Treasury Balancer",

        pipeline: "TREASURY",

        severity: "HIGH",

        confidence: 98,

        autoRemediation: false,

        playbook: "TREASURY_REFILL",

        notification: [
            "telegram",
            "dashboard"
        ],

        affects: [
            "Withdrawals"
        ],

        emits: [
            "incident.created",
            "treasury.critical"
        ],

        recommendation:
            "Fund treasury before operations stop.",

        match(event) {
            return (
                event.stage === "treasury" &&
                event.metadata?.status === "CRITICAL"
            );
        }
    },

    {
        code: "TREASURY_WARNING",

        title: "Treasury Running Low",

        domain: "treasury",

        component: "Treasury Balancer",

        pipeline: "TREASURY",

        severity: "WARNING",

        confidence: 95,

        autoRemediation: false,

        playbook: "TREASURY_REFILL",

        notification: [
            "dashboard"
        ],

        affects: [
            "Withdrawals"
        ],

        emits: [
            "incident.created",
            "treasury.warning"
        ],

        recommendation:
            "Schedule a treasury refill.",

        match(event) {
            return (
                event.stage === "treasury" &&
                event.metadata?.status === "WARNING"
            );
        }
    },

    {
        code: "TREASURY_CHECK_FAILED",

        title: "Treasury Health Check Failed",

        domain: "treasury",

        component: "Treasury Health Monitor",

        pipeline: "TREASURY",

        severity: "CRITICAL",

        confidence: 100,

        autoRemediation: false,

        playbook: "TREASURY_HEALTH",

        notification: [
            "telegram",
            "dashboard",
            "mission-control"
        ],

        affects: [
            "Entire Treasury"
        ],

        emits: [
            "incident.created",
            "treasury.health.failed"
        ],

        recommendation:
            "Inspect treasury service immediately.",

        match(event) {
            return (
                event.stage === "treasury" &&
                event.message === "Treasury health check failed"
            );
        }
    }

];
