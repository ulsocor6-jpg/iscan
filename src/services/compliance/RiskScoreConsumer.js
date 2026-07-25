import brainBus from "../../brainbus/brainBus.js";
import { Channels } from "../../brainbus/channels.js";

// ---- Address halt list (in-memory, flushed on restart) ----------------
const haltedAddresses = new Set();

export function isAddressHalted(address) {
  return haltedAddresses.has(address.toLowerCase());
}

// A REVIEW caused ONLY by our fail-toward-caution paths (missing
// ETHERSCAN_API_KEY, a GoPlus outage) is an infra gap, not a fraud
// signal. Matches the exact reason strings set in contractAnalysis.js /
// tokenSecurityCheck.js — keep in sync if that wording changes.
const INFRA_REASON_PATTERN = /unavailable|not set|request failed|verification check failed/i;
const INFRA_ONLY_CHECKS = new Set(["ContractAnalysis", "TokenSecurity"]);

function isInfraOnlyReview(details) {
  const failing = Object.entries(details || {}).filter(([, d]) => !d.passed);
  if (failing.length === 0) return false;
  return failing.every(
    ([name, d]) => INFRA_ONLY_CHECKS.has(name) && INFRA_REASON_PATTERN.test(d.reason || "")
  );
}

async function handleRiskScore(riskEvent) {
  const { address, totalScore, recommendation, details, tokens, hardBlockedBy } = riskEvent;

  if (recommendation === "APPROVE") {
    console.log("[RiskScoreConsumer] Address " + address + " approved (score " + totalScore + ")");
    return;
  }

  // Hard-blocked (Sanctions / WalletAML / TokenAllowlist) is an
  // unconditional rule match, not a risk signal to weigh — always halt,
  // always CRITICAL, regardless of the weighted score.
  const infraOnly = recommendation === "REVIEW" && !hardBlockedBy && isInfraOnlyReview(details);

  const severity = hardBlockedBy
    ? "CRITICAL"
    : recommendation === "REJECT"
    ? "CRITICAL"
    : infraOnly
    ? "LOW"
    : "WARNING";

  // Only halt the address for a real compliance concern — a REVIEW
  // driven purely by an unavailable check (missing API key, provider
  // outage) should not block a legitimate user's withdrawal.
  const shouldHalt = Boolean(hardBlockedBy) || recommendation === "REJECT" || (recommendation === "REVIEW" && !infraOnly);

  if (shouldHalt) {
    haltedAddresses.add(address.toLowerCase());
  }

  const incident = {
    type: hardBlockedBy ? "compliance_hard_block" : recommendation === "REJECT" ? "compliance_reject" : "compliance_review",
    severity,
    title: hardBlockedBy
      ? `Hard-blocked by ${hardBlockedBy} for ${address}`
      : "Compliance Risk Detected for " + address,
    summary: infraOnly
      ? `Review triggered only by unavailable checks (score ${totalScore}/100) — likely a config/infra gap, not a detected risk signal.`
      : "Risk score " + totalScore + "/100. Recommendation: " + recommendation + ". Tokens: " + tokens.join(", "),
    metadata: {
      address,
      riskScore: totalScore,
      recommendation,
      hardBlockedBy: hardBlockedBy || null,
      details,
      tokens,
      timestamp: new Date(),
      requireHumanReview: !infraOnly,
      haltTransaction: shouldHalt,
    },
    source: "ComplianceInspector",
  };

  try {
    brainBus.emit(Channels.OPERATOR_INCIDENT, incident, {
      source: "ComplianceInspector",
      correlationId: address,
    });
    console.log("[RiskScoreConsumer] Incident emitted for " + address + " (severity=" + severity + ", halted=" + shouldHalt + ")");
  } catch (err) {
    console.error("[RiskScoreConsumer] Failed to emit incident:", err.message);
  }
}

brainBus.on(Channels.COMPLIANCE_RISK_SCORE, handleRiskScore);
console.log("[RiskScoreConsumer] Listening on compliance:riskScore");

export function startRiskScoreConsumer() {
  console.log("[RiskScoreConsumer] Started");
}
