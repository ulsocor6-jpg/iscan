import healthRegistry from "./healthRegistry.js";
import inspectorAdapter from "./adapters/inspectorAdapter.js";
import SystemHealth from "./models/systemHealthModel.js";
// src/intelligence/intelligenceCore.js

const intelligenceCore = {
    name: "Intelligence Core",
    domain: "intelligence",
    type: "orchestrator",
    owner: "Platform Intelligence",
    description:
        "Coordinates platform intelligence by collecting health information, aggregating inspector reports and persisting operational snapshots.",
    purpose: [
        "Collect Inspector Reports",
        "Aggregate Platform Health",
        "Maintain Health Registry",
        "Persist Health Snapshots",
        "Provide System Health"
    ],
    lifecycle: {
        startup:
            "Registers itself with the Health Registry and begins scheduled health collection.",
        runtime:
            "Collects inspector reports every 60 seconds and updates platform health.",
        shutdown:
            "Stops scheduled collection gracefully."
    },
    dependsOn: [
        "healthRegistry",
        "inspectorAdapter",
        "systemHealthModel"
    ],
    provides: [
        "Platform Health",
        "Health Snapshot",
        "Inspector Aggregation",
        "Operational Visibility"
    ],
    consumedBy: [
        "Mission Control",
        "Dashboard",
        "Operator",
        "Telegram",
        "Reasoning Engine"
    ],
    emits: [
        "Health Snapshot Updated",
        "Node Registered",
        "Node Health Updated"
    ],
    healthChecks: [
        "Heartbeat",
        "Snapshot Success",
        "Inspector Collection",
        "Database Persistence"
    ],
    metrics: [
        "Collection Duration",
        "Snapshot Interval",
        "Inspector Count",
        "Last Snapshot",
        "Health Status"
    ],
    failureModes: [
        "Inspector Collection Failure",
        "Snapshot Persistence Failure",
        "Health Registry Failure",
        "Database Failure"
    ],
    recovery: {
        automatic: [
            "Retry Inspector Collection",
            "Retry Snapshot Persistence"
        ],
        manual: [
            "Verify Inspector Availability",
            "Verify MongoDB",
            "Inspect Health Registry"
        ]
    },
    notificationPolicy: {
        warning: [
            "Dashboard"
        ],
        critical: [
            "Telegram",
            "Dashboard",
            "Incident Engine"
        ]
    },
    criticality: "CRITICAL",

    // ---------- New methods to satisfy server.js ----------
    _collectionInterval: null,

    async start() {
        console.log("[IntelligenceCore] Starting health collection...");
        // Register with Health Registry
        healthRegistry.registerNode({ node: "intelligenceCore", type: "orchestrator" });
        healthRegistry.report({ node: "intelligenceCore", status: "ONLINE" });

        // Initial collection
        await this._collectHealth();

        // Set up periodic collection every 60 seconds
        this._collectionInterval = setInterval(() => {
            this._collectHealth().catch(err =>
                console.error("[IntelligenceCore] Collection error:", err)
            );
        }, 60000);
    },

    async _collectHealth() {
        console.log("[IntelligenceCore] Collecting inspector reports...");
        try {
            const inspectorHealth = await inspectorAdapter.collect();
            // report() diffs against the previous status itself and fires
            // the Telegram alert on transitions — nothing extra needed here.
            healthRegistry.report(inspectorHealth);

            const snapshot = healthRegistry.snapshot();
            await SystemHealth.create(snapshot);
        } catch (err) {
            console.error("[IntelligenceCore] Health collection failed:", err.message);
            healthRegistry.report({
                node: "intelligenceCore",
                status: "WARNING",
                error: err.message,
            });
        }
    },

    report(data) {
        console.log("[IntelligenceCore] Received health report:", data);
        healthRegistry.report(data);
    },

    stop() {
        if (this._collectionInterval) {
            clearInterval(this._collectionInterval);
            console.log("[IntelligenceCore] Health collection stopped.");
        }
    },

    getHealth() {
        return {
            overallStatus: healthRegistry.getOverallStatus(),
            nodes: healthRegistry.getAll()
        };
    }
};

export default intelligenceCore;
