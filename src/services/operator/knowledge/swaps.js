// src/services/operator/knowledge/swaps.js

export default [

    {
        code: "ROUTER_REVERT",
        title: "Swap Router Reverted",
        domain: "swaps",
        component: "Swap Router",
        pipeline: "SWAPS",
        severity: "HIGH",
        confidence: 90,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["dashboard"],
        affects: ["Swaps"],
        emits: ["incident.created", "swap.router.reverted"],
        patterns: [
            "execution reverted",
            "call_exception",
            "router reverted"
        ],
        recommendation:
            "Inspect router response and swap parameters."
    },

    {
        code: "SLIPPAGE",
        title: "Slippage Exceeded",
        domain: "swaps",
        component: "Swap Router",
        pipeline: "SWAPS",
        severity: "WARNING",
        confidence: 90,
        autoRemediation: false,
        playbook: "SWAP_RETRY_SLIPPAGE",
        notification: ["dashboard"],
        affects: ["Swaps"],
        emits: ["incident.created", "swap.slippage.exceeded"],
        patterns: [
            "slippage",
            "minimum amount",
            "insufficient output amount"
        ],
        recommendation:
            "Increase slippage tolerance or retry the swap."
    }

];
