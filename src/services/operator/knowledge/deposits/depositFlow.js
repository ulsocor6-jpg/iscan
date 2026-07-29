// src/services/operator/knowledge/deposits/depositFlow.js

export default [

    {
        code: "PHP_DEPOSIT_PARSER_STAGE_FAILED",
        title: "PHP Deposit Parser Stage Failed",
        severity: "WARNING",
        confidence: 75,
        recommendation:
            "Deposit parser failed.",
        match(event) {
            return event.stage === "PARSER" &&
                   event.metadata?.pipeline === "PHP_DEPOSIT";
        }
    },

    {
        code: "PHP_DEPOSIT_USER_LOOKUP_STAGE_FAILED",
        title: "PHP Deposit User Lookup Failed",
        severity: "WARNING",
        confidence: 80,
        recommendation:
            "User lookup failed.",
        match(event) {
            return event.stage === "USER_LOOKUP" &&
                   event.metadata?.pipeline === "PHP_DEPOSIT";
        }
    },

    {
        code: "PHP_DEPOSIT_MATCH_STAGE_FAILED",
        title: "PHP Deposit Match Failed",
        severity: "WARNING",
        confidence: 80,
        recommendation:
            "Deposit request matching failed.",
        match(event) {
            return event.stage === "DEPOSIT_MATCH" &&
                   event.metadata?.pipeline === "PHP_DEPOSIT";
        }
    },

    {
        code: "PHP_DEPOSIT_VERIFIER_STAGE_FAILED",
        title: "PHP Deposit Verifier Failed",
        severity: "WARNING",
        confidence: 82,
        recommendation:
            "Verification stage failed.",
        match(event) {
            return event.stage === "VERIFIER" &&
                   event.metadata?.pipeline === "PHP_DEPOSIT";
        }
    },

    {
        code: "PHP_DEPOSIT_LEDGER_STAGE_FAILED",
        title: "PHP Deposit Ledger Stage Failed",
        severity: "HIGH",
        confidence: 90,
        recommendation:
            "Ledger stage failed.",
        match(event) {
            return event.stage === "LEDGER" &&
                   event.metadata?.pipeline === "PHP_DEPOSIT";
        }
    },

    {
        code: "PHP_DEPOSIT_WALLET_STAGE_FAILED",
        title: "PHP Deposit Wallet Stage Failed",
        severity: "HIGH",
        confidence: 90,
        recommendation:
            "Wallet update failed.",
        match(event) {
            return event.stage === "WALLET" &&
                   event.metadata?.pipeline === "PHP_DEPOSIT";
        }
    },

    {
        code: "PHP_DEPOSIT_EVENT_STREAM_STAGE_FAILED",
        title: "PHP Deposit Event Stream Failed",
        severity: "WARNING",
        confidence: 70,
        recommendation:
            "Realtime event publishing failed.",
        match(event) {
            return event.stage === "EVENT_STREAM" &&
                   event.metadata?.pipeline === "PHP_DEPOSIT";
        }
    }

];
