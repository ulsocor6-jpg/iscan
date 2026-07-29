// src/services/operator/knowledge/withdrawals.js

export default [

    {
        code: "WITHDRAWAL_DEBIT_FAILED",
        title: "Withdrawal Debit Failed",
        domain: "withdrawals",
        component: "Withdrawal Controller",
        pipeline: "WITHDRAWALS",
        severity: "WARNING",
        confidence: 90,
        autoRemediation: false,
        playbook: "SAFE_TO_RETRY",
        notification: ["dashboard"],
        affects: ["Withdrawals"],
        emits: ["incident.created", "withdrawal.debit.failed"],
        patterns: [
            "debit failed for wd-"
        ],
        recommendation:
            "No funds moved. Usually a race on the balance check — safe for the user to retry."
    },

    {
        code: "WITHDRAWAL_SEND_FAILED",
        title: "Withdrawal Send Failed (Reversed)",
        domain: "withdrawals",
        component: "Withdrawal Processor",
        pipeline: "WITHDRAWALS",
        severity: "HIGH",
        confidence: 95,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["telegram", "dashboard"],
        affects: ["Withdrawals", "Treasury"],
        emits: ["incident.created", "withdrawal.send.failed"],
        patterns: [
            "send failed for wd-"
        ],
        recommendation:
            "Ledger debit was reversed automatically. Investigate the on-chain send error before advising retry."
    }

];
