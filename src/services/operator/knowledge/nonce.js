// src/services/operator/knowledge/nonce.js

export default [

    {
        code: "NONCE_CONFLICT",
        title: "Nonce Conflict",
        domain: "blockchain",
        component: "Nonce Manager",
        pipeline: "BLOCKCHAIN",
        severity: "HIGH",
        confidence: 96,
        autoRemediation: false,
        playbook: "NONCE_RESYNC",
        notification: ["dashboard"],
        affects: ["Executors", "Withdrawals", "Swaps"],
        emits: ["incident.created", "nonce.conflict"],
        patterns: [
            "nonce too low",
            "replacement transaction underpriced",
            "already known"
        ],
        recommendation:
            "Inspect the nonce manager and pending transaction queue."
    }

];
