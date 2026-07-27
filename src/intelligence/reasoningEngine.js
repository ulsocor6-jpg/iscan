// src/intelligence/reasoningEngine.js

export default {

    name: "Reasoning Engine",

    domain: "intelligence",

    type: "flow_analyzer",

    owner: "Platform Intelligence",

    description:
        "Analyzes operational pipelines by comparing observed execution against System Knowledge to determine completion, deviation, failure and expected progression.",

    purpose: [

        "Pipeline Analysis",

        "Stage Verification",

        "Gap Detection",

        "Failure Classification",

        "Progress Tracking",

        "Operational Reasoning"

    ],

    lifecycle: {

        startup:
            "Available immediately after Intelligence services initialize.",

        runtime:
            "Analyzes pipeline executions whenever a workflow changes state.",

        shutdown:
            "Stateless service."

    },

    dependsOn: [

        "systemKnowledge",

        "stageTimeline",

        "rootCauseClassifier"

    ],

    provides: [

        "Flow Verdict",

        "Stage Analysis",

        "Root Cause Context",

        "Expected Next Stage",

        "Pipeline Validation"

    ],

    consumedBy: [

        "Incident Engine",

        "Operator",

        "Mission Control",

        "Inspector",

        "Dashboard"

    ],

    inputs: [

        "Pipeline",

        "Observed Stages",

        "Flow Status"

    ],

    outputs: [

        "COMPLETE",

        "IN_PROGRESS",

        "FAILED_AT_STAGE",

        "STALLED",

        "GAP_DETECTED",

        "TERMINATED",

        "UNKNOWN"

    ],

    healthChecks: [

        "Pipeline Lookup",

        "Reasoning Latency",

        "Timeline Generation",

        "Root Cause Classification"

    ],

    metrics: [

        "Flows Analyzed",

        "Average Analysis Time",

        "Gap Count",

        "Failure Count",

        "Stall Count"

    ],

    failureModes: [

        "Unknown Pipeline",

        "Missing System Knowledge",

        "Timeline Generation Failure",

        "Root Cause Classification Failure"

    ],

    recovery: {

        automatic: [

            "Retry Analysis",

            "Fallback To UNKNOWN"

        ],

        manual: [

            "Review System Knowledge",

            "Verify Inspector Stage Calls",

            "Review Root Cause Rules"

        ]

    },

    notificationPolicy: {

        warning: [

            "Dashboard"

        ],

        critical: [

            "Incident Engine"

        ]

    },

    criticality: "CRITICAL",

    analyzeFlow(flow) {
        const stages = flow.stages || [];
        const failedStage = stages.find(s => s.status === "FAILED");
        const runningStage = stages.find(s => s.status === "RUNNING");

        if (flow.status === "FAILED" || failedStage) {
            return {
                verdict: "FAILED_AT_STAGE",
                stage: failedStage ? failedStage.name : null,
                reason: failedStage ? failedStage.error : "Unknown failure",
            };
        }

        if (flow.status === "SUCCESS") {
            return { verdict: "COMPLETE", stage: null, reason: null };
        }

        if (runningStage) {
            const ageMs = Date.now() - new Date(runningStage.startedAt || flow.updatedAt).getTime();
            const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 min
            if (ageMs > STALL_THRESHOLD_MS) {
                return {
                    verdict: "STALLED",
                    stage: runningStage.name,
                    reason: `No progress for ${Math.round(ageMs / 60000)} min`,
                };
            }
            return { verdict: "IN_PROGRESS", stage: runningStage.name, reason: null };
        }

        return { verdict: "UNKNOWN", stage: null, reason: null };
    }

};
