// src/services/reconciliation/driftClassifier.js
//
// Takes one currency-level result from reconciliationService.reconcileUser()
// (which already tells you in_sync / ledger_ahead_of_chain / chain_ahead_of_ledger)
// and classifies it into the three buckets from the architecture diagram:
//
//   NO_DRIFT   - reconciliationService already calls this 'in_sync'
//   SAFE_DRIFT - small enough to auto-fix without a human
//   RISK_DRIFT - large enough (or wrong direction) that it needs a human
//
// Thresholds are per-currency and env-overridable so you can tighten them
// in production without a code change.

const DEFAULT_SAFE_THRESHOLD = {
  USDC: Number(process.env.RECON_SAFE_DRIFT_USDC ?? 1),
  USDT: Number(process.env.RECON_SAFE_DRIFT_USDT ?? 1),
};

// Debiting a user (ledger_ahead_of_chain) is inherently more sensitive than
// crediting them (chain_ahead_of_ledger - funds are real, just uncredited),
// so the safe threshold for debits is a fraction of the credit threshold
// unless explicitly overridden.
const DEBIT_SAFETY_FACTOR = Number(process.env.RECON_DEBIT_SAFETY_FACTOR ?? 0.2);

export function classifyDrift(result) {
  const { currency, drift, status } = result;

  if (status === 'in_sync') {
    return { riskLevel: 'NO_DRIFT', reason: 'drift within epsilon tolerance' };
  }

  const safeThreshold = DEFAULT_SAFE_THRESHOLD[currency] ?? 0;
  const effectiveThreshold = status === 'ledger_ahead_of_chain'
    ? safeThreshold * DEBIT_SAFETY_FACTOR
    : safeThreshold;

  const amount = Math.abs(drift);

  if (amount <= effectiveThreshold) {
    return {
      riskLevel: 'SAFE_DRIFT',
      reason: `|drift|=${amount} <= safe threshold ${effectiveThreshold} for ${currency} (${status})`,
    };
  }

  return {
    riskLevel: 'RISK_DRIFT',
    reason: `|drift|=${amount} exceeds safe threshold ${effectiveThreshold} for ${currency} (${status})`,
  };
}

export default { classifyDrift };
