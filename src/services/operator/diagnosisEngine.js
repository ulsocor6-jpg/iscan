// Descriptor – exported as default
export const diagnosisEngine = {
  name: "Diagnosis Engine",
  domain: "intelligence",
  type: "diagnostic_engine",
  owner: "Platform Intelligence",
  description:
    "Interprets operational events by matching them against structured diagnostic knowledge and classifying them into standardized diagnoses.",
  purpose: [
    "Classify Events",
    "Identify Known Failures",
    "Assign Severity",
    "Estimate Confidence",
    "Recommend Recovery",
    "Normalize Diagnoses"
  ],
  lifecycle: {
    startup: "Loads diagnostic knowledge and matching rules.",
    runtime:
      "Evaluates every operational event using structured rule matching followed by legacy pattern matching.",
    shutdown: "Stateless service."
  },
  dependsOn: ["knowledgeBase"],
  provides: [
    "Diagnosis",
    "Severity",
    "Confidence",
    "Recommendation",
    "Incident Classification"
  ],
  consumedBy: [
    "Incident Engine",
    "Operator",
    "Mission Control",
    "Telegram",
    "Dashboard"
  ],
  inputs: ["Inspector Event", "Operational Event"],
  outputs: ["Diagnosis Object", "UNKNOWN"],
  healthChecks: [
    "Knowledge Base Loaded",
    "Rule Matching",
    "Pattern Matching",
    "Diagnosis Latency"
  ],
  metrics: [
    "Events Diagnosed",
    "Rule Match Rate",
    "Pattern Match Rate",
    "Unknown Diagnoses",
    "Average Diagnosis Time"
  ],
  failureModes: [
    "Knowledge Base Missing",
    "Rule Evaluation Failure",
    "Pattern Evaluation Failure",
    "Unknown Event"
  ],
  recovery: {
    automatic: [
      "Fallback To Pattern Matching",
      "Fallback To UNKNOWN Diagnosis"
    ],
    manual: [
      "Review Knowledge Base",
      "Add New Diagnostic Rule",
      "Improve Event Metadata"
    ]
  },
  notificationPolicy: {
    warning: ["Dashboard"],
    critical: ["Incident Engine"]
  },
  criticality: "CRITICAL"
};

import knowledgeBase from "./knowledgeBase.js";

function matchAgainstKnowledgeBase(event) {
    const message = (event.message || "").toLowerCase();

    for (const rule of knowledgeBase) {
        if (typeof rule.match === "function") {
            try {
                if (rule.match(event)) return rule;
            } catch (err) {
                console.warn(`[DiagnosisEngine] Rule "${rule.code}" match() threw:`, err.message);
                continue;
            }
        }

        if (Array.isArray(rule.patterns) && rule.patterns.length > 0) {
            const hit = rule.patterns.some((p) => message.includes(p.toLowerCase()));
            if (hit) return rule;
        }
    }

    return null;
}

export function diagnose(event = {}) {

    const stage = (event.stage || "").toLowerCase();
    const level = (event.level || "").toUpperCase();
    const message = event.message || "";
    const meta = event.metadata || {};

    // Routine recalculation from TreasuryCoordinator on every balance
    // mutation — not a failure, not actionable. Skipping incident
    // creation here (return null) since incidentEngine.process() treats
    // a null diagnosis as "no incident" and drops it silently.
    if (stage === "treasury" && event.type === "TREASURY_UPDATE") {
        return null;
    }

    const matched = matchAgainstKnowledgeBase(event);
    if (matched) {
        return {
            code: matched.code,
            title: matched.title,
            message: matched.recommendation
                ? `${matched.title}: ${message || matched.recommendation}`
                : (message || matched.title),
            severity: matched.severity,
            recommendation: matched.recommendation,
            playbook: matched.playbook,
            autoRemediation: matched.autoRemediation === true,
            confidence: (matched.confidence ?? 100) / 100,
            metadata: meta
        };
    }

    if (stage === "treasury") {

        if (meta.status === "DEADLOCK") {
            return {
                code: "TREASURY_DEADLOCK",
                title: "Treasury Deadlock",
                message: `${meta.currency} treasury has no usable liquidity.`,
                severity: "CRITICAL",
                recommendation: `Inject liquidity into ${meta.currency} treasury.`,
                confidence: 1.0,
                metadata: meta
            };
        }

        if (meta.status === "HEALTHY") {
            return {
                code: "TREASURY_HEALTHY",
                title: "Treasury Healthy",
                message: `${meta.currency} treasury healthy (${meta.usable} usable).`,
                severity: "INFO",
                recommendation: "No action required.",
                confidence: 1.0,
                metadata: meta
            };
        }

        if (meta.status === "UNMATCHED_INCREASE") {
            return {
                code: "TREASURY_UNMATCHED_INCREASE",
                title: "Unmatched treasury increase",
                message: `${meta.pool} pool increased by ${meta.treasuryIncrease} with no matching pending deposit.`,
                severity: "WARNING",
                recommendation: "Check for an untracked deposit, a split/partial payment, or a missing addPendingDeposit call.",
                confidence: 0.8,
                metadata: meta
            };
        }

        if (meta.status === "AMBIGUOUS_INCREASE") {
            return {
                code: "TREASURY_AMBIGUOUS_INCREASE",
                title: "Ambiguous treasury increase",
                message: `${meta.pool} pool increase of ${meta.treasuryIncrease} matches ${meta.candidateCount} pending deposits — cannot auto-credit.`,
                severity: "WARNING",
                recommendation: "Manually match by reference and credit the correct deposit.",
                confidence: 0.7,
                metadata: meta
            };
        }
    }

    if (stage === "recoveryworker") {
        return {
            code: "RECOVERY_COMPLETED",
            title: "Recovery Worker",
            message,
            severity: "INFO",
            recommendation: "Recovery completed successfully.",
            confidence: 1.0,
            metadata: meta
        };
    }

    if (stage === "pipeline") {

        if (message.includes("Idle")) {
            return {
                code: "PIPELINE_IDLE",
                title: "Pipeline Idle",
                message,
                severity: "INFO",
                recommendation: "No action required.",
                confidence: 1.0,
                metadata: meta
            };
        }
    }

    return {
        code: level === "ERROR" ? "ERROR" : "UNKNOWN",
        title: message || "Unknown Event",
        message,
        severity: level === "ERROR" ? "ERROR" : "INFO",
        recommendation: level === "ERROR"
            ? "Investigate subsystem."
            : "No automated action taken.",
        confidence: 0.5,
        metadata: meta
    };
}

export default diagnosisEngine;
