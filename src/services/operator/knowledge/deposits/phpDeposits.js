// src/services/operator/knowledge/deposits/phpDeposits.js

export default [

    {
        code: "DEPOSIT_SENDER_MISMATCH",
        title: "Deposit Sender Not Linked",
        domain: "deposits",
        component: "PHP Deposit Verifier",
        pipeline: "PHP_DEPOSIT",
        severity: "WARNING",
        confidence: 85,
        autoRemediation: false,
        playbook: "MANUAL_REVIEW",
        notification: ["dashboard"],
        affects: ["PHP Deposits"],
        emits: ["incident.created", "deposit.sender.mismatch"],
        patterns: [
            "deposit notification sender not linked to any wallet"
        ],
        recommendation:
            "A payment came in from an account that isn't linked to any user. Check DepositVerificationLog for the raw payload."
    },

    {
        code: "DEPOSIT_NO_ACTIVE_REQUEST",
        title: "Deposit With No Active Request",
        domain: "deposits",
        component: "PHP Deposit Verifier",
        pipeline: "PHP_DEPOSIT",
        severity: "WARNING",
        confidence: 88,
        autoRemediation: false,
        playbook: "MANUAL_REVIEW",
        notification: ["dashboard"],
        affects: ["PHP Deposits"],
        emits: ["incident.created", "deposit.no_active_request"],
        patterns: [
            "payment received for.*with no active deposit request"
        ],
        recommendation:
            "Funds arrived without an active deposit request. Manual review required."
    },

    {
        code: "DEPOSIT_AMOUNT_MISMATCH",
        title: "Deposit Amount Mismatch",
        domain: "deposits",
        component: "PHP Deposit Verifier",
        pipeline: "PHP_DEPOSIT",
        severity: "HIGH",
        confidence: 93,
        autoRemediation: false,
        playbook: "MANUAL_REVIEW",
        notification: ["dashboard"],
        affects: ["PHP Deposits"],
        emits: ["incident.created", "deposit.amount.mismatch"],
        patterns: [
            "amount mismatch for"
        ],
        recommendation:
            "Requested amount differs from received amount. Manual confirmation required."
    },

    {
        code: "PHP_DEPOSIT_LEDGER_FAILED",
        title: "PHP Deposit Ledger Credit Failed",
        domain: "deposits",
        component: "PHP Deposit Ledger",
        pipeline: "PHP_DEPOSIT",
        severity: "HIGH",
        confidence: 95,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["telegram", "dashboard"],
        affects: ["PHP Deposits"],
        emits: ["incident.created", "deposit.ledger.failed"],
        patterns: [
            "ledger credit failed for ref"
        ],
        recommendation:
            "Ledger credit failed. Deposit returned to PENDING."
    },

    {
        code: "PHP_DEPOSIT_REQUEST_FAILED",
        title: "PHP Deposit Request Failed",
        domain: "deposits",
        component: "PHP Deposit Request Service",
        pipeline: "PHP_DEPOSIT",
        severity: "WARNING",
        confidence: 88,
        autoRemediation: false,
        playbook: "SAFE_TO_RETRY",
        notification: ["dashboard"],
        affects: ["PHP Deposits"],
        emits: ["incident.created", "deposit.request.failed"],
        patterns: [
            "deposit request failed"
        ],
        recommendation:
            "Deposit request creation failed. User may retry."
    }

];
