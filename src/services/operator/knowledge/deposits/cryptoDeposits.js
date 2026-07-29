// src/services/operator/knowledge/deposits/cryptoDeposits.js

export default [

    {
        code: "DEPOSIT_PROCESSING_FAILED",
        title: "Deposit Processing Failed",
        domain: "deposits",
        component: "Crypto Deposit Processor",
        pipeline: "CRYPTO_DEPOSIT",
        severity: "HIGH",
        confidence: 92,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["dashboard"],
        affects: ["Crypto Deposits"],
        emits: ["incident.created", "deposit.processing.failed"],
        patterns: [
            "failed processing deposit tx"
        ],
        recommendation:
            "On-chain deposit detected but processing failed."
    },

    {
        code: "DEPOSIT_SCAN_FAILED",
        title: "Deposit Scan Failed",
        domain: "deposits",
        component: "Blockchain Listener",
        pipeline: "CRYPTO_DEPOSIT",
        severity: "WARNING",
        confidence: 85,
        autoRemediation: false,
        playbook: "RPC_RETRY",
        notification: ["dashboard"],
        affects: ["Crypto Deposits"],
        emits: ["incident.created", "deposit.scan.failed"],
        patterns: [
            "base stable scan failed for",
            "base stable listener watch loop failed"
        ],
        recommendation:
            "Blockchain scan failed. Verify RPC health."
    },

    {
        code: "DEPOSIT_SCAN_FAILED_RONIN",
        title: "Ronin Deposit Scan Failed",
        domain: "deposits",
        component: "Ronin Deposit Listener",
        pipeline: "CRYPTO_DEPOSIT",
        severity: "WARNING",
        confidence: 85,
        autoRemediation: false,
        playbook: "RPC_RETRY",
        notification: ["dashboard"],
        affects: ["Crypto Deposits"],
        emits: ["incident.created", "deposit.scan.failed.ronin"],
        patterns: [
            "ronin_getLogs failed",
            "Ronin RPC timeout",
            "Ronin deposit scan failed for block",
            "Invalid response from Ronin RPC",
            "query returned more than 10000 results",
            "rejected due to project ID settings",
            "could not detect network"
        ],
        recommendation:
            "Ronin blockchain scan failed. Verify Ronin RPC health and API key limits."
    }

];
