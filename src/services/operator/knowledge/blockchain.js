// src/services/operator/knowledge/blockchain.js

export default [

    {
        code: "FORWARDER_TRANSFER_FAILED",
        title: "Forwarder Sweep Transfer Failed",
        domain: "blockchain",
        component: "Deposit Forwarder",
        pipeline: "BLOCKCHAIN",
        severity: "HIGH",
        confidence: 95,
        autoRemediation: false,
        playbook: "FORWARDER_SWEEP_RETRY",
        notification: ["dashboard"],
        affects: ["Deposits", "Treasury"],
        emits: ["incident.created", "forwarder.transfer.failed"],
        patterns: [
            "depositforwarder: native transfer failed",
            "depositforwarder: token transfer failed"
        ],
        recommendation:
            "Retry the sweep. If it continues to fail, inspect the forwarder's balance and treasury contract."
    },

    {
        code: "FORWARDER_ADDRESS_MISMATCH",
        title: "Forwarder Address Mismatch",
        domain: "blockchain",
        component: "Deposit Forwarder Factory",
        pipeline: "BLOCKCHAIN",
        severity: "CRITICAL",
        confidence: 99,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["telegram", "dashboard", "mission-control"],
        affects: ["Deposits", "Treasury"],
        emits: ["incident.created", "forwarder.address.mismatch"],
        patterns: [
            "forwarderfactory: address mismatch"
        ],
        recommendation:
            "Stop sweeping immediately. The CREATE2 address does not match the expected deployment."
    },

    {
        code: "SWEEP_GAS_NOT_CONFIGURED",
        title: "Sweep Treasury Key Missing",
        domain: "blockchain",
        component: "Deposit Forwarder",
        pipeline: "BLOCKCHAIN",
        severity: "CRITICAL",
        confidence: 100,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["telegram", "dashboard", "mission-control"],
        affects: ["Deposits", "Treasury"],
        emits: ["incident.created", "sweep.gas.not_configured"],
        patterns: [
            "base_treasury_private_key is not set",
            "ronin_treasury_private_key is not set",
            "cannot pay gas for forwarder sweep",
            "cannot fund gas for sweep"
        ],
        recommendation:
            "Configure the treasury private key before allowing sweep operations."
    },

    {
        code: "SWEEP_SHORT_BALANCE",
        title: "Sweep Refused — Balance Short",
        domain: "blockchain",
        component: "Deposit Forwarder",
        pipeline: "BLOCKCHAIN",
        severity: "WARNING",
        confidence: 92,
        autoRemediation: false,
        playbook: "AWAIT_CONFIRMATION",
        notification: ["dashboard"],
        affects: ["Deposits"],
        emits: ["incident.created", "sweep.short_balance"],
        patterns: [
            "refusing to sweep a short amount",
            "has no receivedamount to sweep"
        ],
        recommendation:
            "Expected balance has not yet arrived. Check for pending confirmations."
    }

];
