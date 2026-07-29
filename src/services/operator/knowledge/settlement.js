// src/services/operator/knowledge/settlement.js

export default [

    {
        code: "PHP_ONCHAIN_BALANCE_MISMATCH",
        title: "PHP Swap Refused — On-chain Balance Short",
        domain: "settlement",
        component: "PHP Settlement Service",
        pipeline: "SETTLEMENT",
        severity: "WARNING",
        confidence: 96,
        autoRemediation: false,
        playbook: "AWAIT_CONFIRMATION",
        notification: ["dashboard"],
        affects: ["PHP Settlement"],
        emits: ["incident.created", "settlement.balance.mismatch"],
        patterns: [
            "on-chain balance mismatch for user"
        ],
        recommendation:
            "User's on-chain balance is less than claimed — no PHP was credited. Check for a pending or unconfirmed deposit."
    },

    {
        code: "PHP_SWEEP_FAILED",
        title: "PHP Swap Sweep Failed",
        domain: "settlement",
        component: "PHP Settlement Service",
        pipeline: "SETTLEMENT",
        severity: "HIGH",
        confidence: 95,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["telegram", "dashboard"],
        affects: ["PHP Settlement", "Treasury"],
        emits: ["incident.created", "settlement.sweep.failed"],
        patterns: [
            "sweep failed for"
        ],
        recommendation:
            "Stablecoin was never swept to treasury — no PHP was credited. Investigate the sweep error before retrying."
    },

    {
        code: "PHP_SWEEP_MISMATCH",
        title: "PHP Swap Sweep Amount Mismatch",
        domain: "settlement",
        component: "PHP Settlement Service",
        pipeline: "SETTLEMENT",
        severity: "CRITICAL",
        confidence: 97,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["telegram", "dashboard", "mission-control"],
        affects: ["PHP Settlement", "Treasury"],
        emits: ["incident.created", "settlement.sweep.mismatch"],
        patterns: [
            "sweep did not confirm expected amount"
        ],
        recommendation:
            "Swept amount didn't match expected — do not credit PHP. Investigate before any manual override."
    }

];
