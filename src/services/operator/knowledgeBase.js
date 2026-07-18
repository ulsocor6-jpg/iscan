// src/services/operator/knowledgeBase.js

export default [

  // ==========================================================
  // TREASURY (Structured Rules)
  // ==========================================================

  {
    code: "TREASURY_DEADLOCK",
    title: "Treasury Deadlock",
    severity: "CRITICAL",
    confidence: 100,
    recommendation: "Inject liquidity immediately.",

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
    severity: "HIGH",
    confidence: 98,
    recommendation: "Fund treasury before operations stop.",

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
    severity: "WARNING",
    confidence: 95,
    recommendation: "Schedule a treasury refill.",

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
    severity: "CRITICAL",
    confidence: 100,
    recommendation: "Inspect treasury service immediately.",

    match(event) {
      return (
        event.stage === "treasury" &&
        event.message === "Treasury health check failed"
      );
    }
  },

  // ==========================================================
  // RPC
  // ==========================================================

  {
    code: "RPC_TIMEOUT",
    title: "RPC Timeout",
    patterns: [
      "timeout",
      "request timeout",
      "rpc timeout"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Retry using a healthy RPC endpoint."
  },

  {
    code: "RPC_UNAVAILABLE",
    title: "RPC Unavailable",
    patterns: [
      "failed to fetch",
      "network error",
      "socket hang up",
      "econnreset",
      "connection refused"
    ],
    severity: "CRITICAL",
    confidence: 97,
    recommendation: "Switch to a backup RPC provider."
  },

  // ==========================================================
  // TREASURY (Legacy String Rules)
  // ==========================================================

  {
    code: "INSUFFICIENT_FUNDS",
    title: "Treasury Balance Too Low",
    patterns: [
      "insufficient funds",
      "insufficient balance"
    ],
    severity: "CRITICAL",
    confidence: 99,
    recommendation: "Fund the treasury wallet."
  },

  {
    code: "OUT_OF_GAS",
    title: "Treasury Gas Too Low",
    patterns: [
      "out of gas",
      "intrinsic gas",
      "gas required exceeds"
    ],
    severity: "HIGH",
    confidence: 98,
    recommendation: "Fund the gas wallet."
  },

  // ==========================================================
  // NONCE
  // ==========================================================

  {
    code: "NONCE_CONFLICT",
    title: "Nonce Conflict",
    patterns: [
      "nonce too low",
      "replacement transaction underpriced",
      "already known"
    ],
    severity: "HIGH",
    confidence: 96,
    recommendation: "Inspect the nonce manager."
  },

  // ==========================================================
  // SWAPS
  // ==========================================================

  {
    code: "ROUTER_REVERT",
    title: "Swap Router Reverted",
    patterns: [
      "execution reverted",
      "call_exception",
      "router reverted"
    ],
    severity: "HIGH",
    confidence: 90,
    recommendation: "Inspect router response and swap parameters."
  },

  {
    code: "SLIPPAGE",
    title: "Slippage Exceeded",
    patterns: [
      "slippage",
      "minimum amount",
      "insufficient output amount"
    ],
    severity: "WARNING",
    confidence: 90,
    recommendation: "Increase slippage tolerance or retry."
  },

  // ==========================================================
  // WORKERS
  // ==========================================================

  {
    code: "QUEUE_STALLED",
    title: "Worker Queue Stalled",
    patterns: [
      "queue stalled",
      "job stalled",
      "worker stalled"
    ],
    severity: "HIGH",
    confidence: 94,
    recommendation: "Restart the affected worker."
  },

  // ==========================================================
  // PHP DEPOSIT (cash-in via GCash/Maya/Bank)
  // ==========================================================

  {
    code: "PHP_DEPOSIT_LEDGER_FAILED",
    title: "PHP Deposit Ledger Credit Failed",
    patterns: [
      "ledger credit failed for ref"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Deposit was reverted to PENDING automatically — safe to retry admin confirm. Investigate the ledger error if it repeats."
  },

  {
    code: "PHP_DEPOSIT_REQUEST_FAILED",
    title: "PHP Deposit Request Failed",
    patterns: [
      "deposit request failed"
    ],
    severity: "WARNING",
    confidence: 88,
    recommendation: "User's cash-in request never got created — safe for them to retry."
  },

  // ==========================================================
  // DEPOSIT
  // ==========================================================

  {
    code: "DEPOSIT_PROCESSING_FAILED",
    title: "Deposit Processing Failed",
    patterns: [
      "failed processing deposit tx"
    ],
    severity: "HIGH",
    confidence: 92,
    recommendation: "Deposit was detected on-chain but failed to process — check cryptoDepositPipeline for the underlying error before assuming funds are lost."
  },

  {
    code: "DEPOSIT_SCAN_FAILED",
    title: "Deposit Scan Failed",
    patterns: [
      "base stable scan failed for",
      "base stable listener watch loop failed"
    ],
    severity: "WARNING",
    confidence: 85,
    recommendation: "A scan cycle failed — usually transient (RPC hiccup). If it repeats, check RPC provider health."
  },

  // ==========================================================
  // WITHDRAWAL
  // ==========================================================

  {
    code: "WITHDRAWAL_DEBIT_FAILED",
    title: "Withdrawal Debit Failed",
    patterns: [
      "debit failed for wd-"
    ],
    severity: "WARNING",
    confidence: 90,
    recommendation: "No funds moved. Usually a race on the balance check — safe for the user to retry."
  },

  {
    code: "WITHDRAWAL_SEND_FAILED",
    title: "Withdrawal Send Failed (Reversed)",
    patterns: [
      "send failed for wd-"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Ledger debit was reversed automatically. Investigate the on-chain send error before advising retry."
  },

  // ==========================================================
  // PHP SETTLEMENT
  // ==========================================================

  {
    code: "PHP_ONCHAIN_BALANCE_MISMATCH",
    title: "PHP Swap Refused — On-chain Balance Short",
    patterns: [
      "on-chain balance mismatch for user"
    ],
    severity: "WARNING",
    confidence: 96,
    recommendation: "User's on-chain balance is less than claimed — no PHP was credited. Check for a pending/unconfirmed deposit."
  },

  {
    code: "PHP_SWEEP_FAILED",
    title: "PHP Swap Sweep Failed",
    patterns: [
      "sweep failed for"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Stablecoin was never swept to treasury — no PHP was credited. Investigate the sweep error before retrying."
  },

  {
    code: "PHP_SWEEP_MISMATCH",
    title: "PHP Swap Sweep Amount Mismatch",
    patterns: [
      "sweep did not confirm expected amount"
    ],
    severity: "CRITICAL",
    confidence: 97,
    recommendation: "Swept amount didn't match expected — do not credit PHP. Investigate before any manual override."
  },

  // ==========================================================
  // FORWARDER SWEEP
  // ==========================================================

  {
    code: "FORWARDER_TRANSFER_FAILED",
    title: "Forwarder Sweep Transfer Failed",
    patterns: [
      "depositforwarder: native transfer failed",
      "depositforwarder: token transfer failed"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Retry the sweep; if it keeps failing, inspect the forwarder's on-chain balance and treasury contract state."
  },

  {
    code: "FORWARDER_ADDRESS_MISMATCH",
    title: "Forwarder Address Mismatch",
    patterns: [
      "forwarderfactory: address mismatch"
    ],
    severity: "CRITICAL",
    confidence: 99,
    recommendation: "Stop sweeping this salt immediately — the CREATE2 address did not match. Investigate factory/init-code integrity before retrying."
  },

  {
    code: "SWEEP_GAS_NOT_CONFIGURED",
    title: "Sweep Treasury Key Missing",
    patterns: [
      "base_treasury_private_key is not set",
      "ronin_treasury_private_key is not set",
      "cannot pay gas for forwarder sweep",
      "cannot fund gas for sweep"
    ],
    severity: "CRITICAL",
    confidence: 100,
    recommendation: "Set the treasury private key env var — sweeps cannot pay gas without it."
  },

  {
    code: "SWEEP_SHORT_BALANCE",
    title: "Sweep Refused — Balance Short",
    patterns: [
      "refusing to sweep a short amount",
      "has no receivedamount to sweep"
    ],
    severity: "WARNING",
    confidence: 92,
    recommendation: "On-chain balance is less than expected — check for a partial or pending deposit before forcing a sweep."
  },

  // ==========================================================
  // DATABASE
  // ==========================================================

  {
    code: "DATABASE",
    title: "Database Failure",
    patterns: [
      "mongoose",
      "mongodb",
      "e11000",
      "buffering timed out"
    ],
    severity: "CRITICAL",
    confidence: 96,
    recommendation: "Inspect MongoDB connectivity."
  }

];
