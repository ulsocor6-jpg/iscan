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

// TODO: Replace this placeholder with the actual diagnosis logic.
// This function must satisfy the import { diagnose } from "./diagnosisEngine.js"

export function diagnose(event = {}) {

    const stage = (event.stage || "").toLowerCase();
    const level = (event.level || "").toUpperCase();
    const message = event.message || "";
    const meta = event.metadata || {};

    // Treasury
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
    }

    // Recovery Worker

    if (stage === "RecoveryWorker") {
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

    // Pipeline

    if (stage === "Pipeline") {

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

    // Generic

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
