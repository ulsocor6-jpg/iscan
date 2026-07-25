// src/intelligence/rootCauseClassifier.js
// ────────────────────────────────────────────────────────────────────────────
// Classifies a stage failure's raw error text into a semantic root-cause
// category, so the operator isn't left reading "Insufficient USDC balance"
// and "Path txHash is not in schema" as the same kind of problem.
//
// This is deliberately separate from reasoningEngine.js: reasoningEngine
// answers "where did the flow break" (structural — which stage, was a
// stage skipped, is it stalled). This module answers "why did that stage
// break" (semantic — is it a funding gap, a code bug, a config problem).
// The two compose: reasoningEngine calls this for its FAILED_AT_STAGE verdict.
// ────────────────────────────────────────────────────────────────────────────

export const RootCause = {
  FUNDING_GAP: "FUNDING_GAP",               // balance/liquidity insufficient at time of execution
  SCHEMA_BUG: "SCHEMA_BUG",                 // code/data-model mismatch — retry will not help
  CONFIG_CREDENTIALS: "CONFIG_CREDENTIALS", // missing/invalid key, wallet, or env config
  CONTRACT_REVERT: "CONTRACT_REVERT",       // on-chain execution reverted (slippage, allowance, liquidity)
  NETWORK_RPC: "NETWORK_RPC",               // upstream RPC/provider timeout or unavailability
  DUPLICATE_OR_STATE: "DUPLICATE_OR_STATE", // idempotency/state conflict (already processed, cancelled, etc.)
  UNKNOWN: "UNKNOWN",
};

// Human-facing metadata per category. `retryable` is a hint, not a guarantee —
// operators should still read the explanation before hitting Retry.
const META = {
  [RootCause.FUNDING_GAP]: {
    label: "Funding gap",
    retryable: true,
    guidance: "Not a code bug. The stage ran but didn't have enough balance at execution time — check whether an upstream stage under-delivered, or whether a concurrent transaction consumed the balance first.",
  },
  [RootCause.SCHEMA_BUG]: {
    label: "Schema/code bug",
    retryable: false,
    guidance: "The operation itself likely succeeded; the failure is in how the result was validated or persisted. Retrying will fail the same way until the code/schema is fixed.",
  },
  [RootCause.CONFIG_CREDENTIALS]: {
    label: "Config/credentials",
    retryable: false,
    guidance: "A required key, wallet, or environment value is missing or invalid for this chain/provider. Retrying without fixing config will fail identically.",
  },
  [RootCause.CONTRACT_REVERT]: {
    label: "Contract revert",
    retryable: true,
    guidance: "The on-chain call reverted — commonly slippage, insufficient allowance, or thin liquidity at quote time. Often transient; worth a retry with a fresh quote.",
  },
  [RootCause.NETWORK_RPC]: {
    label: "Network/RPC",
    retryable: true,
    guidance: "An upstream RPC/provider call timed out or was unreachable. Usually transient — safe to retry once connectivity is confirmed.",
  },
  [RootCause.DUPLICATE_OR_STATE]: {
    label: "State conflict",
    retryable: false,
    guidance: "This flow is in a state that blocks re-running as-is (already processed, cancelled, or an idempotency key collision). Check current state before retrying.",
  },
  [RootCause.UNKNOWN]: {
    label: "Unclassified",
    retryable: null,
    guidance: "No rule matched this error text yet. Treat as unknown until a human reviews it — consider adding a rule once the real cause is confirmed.",
  },
};

// Ordered rules — first match wins. Keep specific patterns before generic
// ones (e.g. "insufficient .* allowance" before a bare "insufficient").
const RULES = [
  { cause: RootCause.SCHEMA_BUG, pattern: /is not in schema|strict mode|validation failed|cast to \w+ failed|E11000 duplicate key/i },
  { cause: RootCause.CONFIG_CREDENTIALS, pattern: /invalid private key|no .*(hd index|wallet).*(found|on file)|missing.*(env|api key|address)|not supported on/i },
  { cause: RootCause.DUPLICATE_OR_STATE, pattern: /already (completed|processed|swept)|not authorized|order already|idempotency/i },
  { cause: RootCause.CONTRACT_REVERT, pattern: /execution reverted|insufficient.*allowance|slippage|transaction underpriced|gas required exceeds/i },
  { cause: RootCause.NETWORK_RPC, pattern: /timeout|econnrefused|rate limit|502|503|failed to fetch|network error/i },
  { cause: RootCause.FUNDING_GAP, pattern: /insufficient (usdc|usdt|flower|php|balance|liquidity)|balance mismatch|refusing to credit/i },
];

/**
 * Classify a single stage failure.
 * @param {string} errorText - raw error/failureReason string
 * @param {object} [context] - optional extra signal, e.g. { stage, hasOutputTxHash }
 * @returns {{ cause: string, label: string, retryable: boolean|null, guidance: string, matched: boolean }}
 */
export function classifyError(errorText, context = {}) {
  const text = String(errorText || "");

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      const meta = META[rule.cause];
      return { cause: rule.cause, matched: true, ...meta };
    }
  }

  const meta = META[RootCause.UNKNOWN];
  return { cause: RootCause.UNKNOWN, matched: false, ...meta };
}

/**
 * Build the operator-facing "why did this stop here" line by combining the
 * structural fact (which stage failed, which downstream stages never ran —
 * from stageTimeline.js) with the semantic classification above.
 * @param {{ name: string, status: string }[]} timeline - from buildStageTimeline()
 * @param {string} failedStageName
 * @param {string} errorText
 * @param {object} [context]
 */
export function explainFailure(timeline, failedStageName, errorText, context = {}) {
  const classification = classifyError(errorText, context);
  const failedIndex = timeline.findIndex(s => s.name === failedStageName);
  const neverRan = timeline.slice(failedIndex + 1).filter(s => s.status === "never").map(s => s.name);

  let causality = `Stopped at ${failedStageName}.`;
  if (neverRan.length > 0) {
    causality += ` ${neverRan.join(", ")} never ran because ${failedStageName} never produced output for ${neverRan.length > 1 ? "them" : "it"} to act on — ${neverRan.length > 1 ? "they are" : "it is"} not broken, just unreached.`;
  }

  return {
    ...classification,
    stage: failedStageName,
    neverReached: neverRan,
    causality,
    rawError: errorText,
  };
}

export default { classifyError, explainFailure, RootCause };
