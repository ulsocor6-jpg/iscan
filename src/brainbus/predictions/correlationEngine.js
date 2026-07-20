// src/brainbus/predictions/correlationEngine.js
// ────────────────────────────────────────────────────────────────────────────
// Groups related incidents together so the Operator sees clusters instead
// of individual alerts. Correlates by: pipeline, time window, error type.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "../brainBus.js";
import { Channels } from "../channels.js";

class CorrelationEngine {
    constructor() {
        this._clusters = new Map(); // clusterId → { incidents: [], pipeline, rootCause, timestamp }
        this._windowMs = 5 * 60 * 1000; // 5 minutes
        this._started = false;
    }

    start() {
        if (this._started) return;
        this._started = true;

        brainBus.on(Channels.OPERATOR_INCIDENT, (envelope) => {
            const incident = envelope.payload;
            const now = Date.now();

            // Find or create cluster by pipeline + error type
            const clusterKey = `${incident.pipeline || "unknown"}:${incident.type || incident.code || "unknown"}`;

            // Clean old clusters
            for (const [id, cluster] of this._clusters) {
                if (now - cluster.lastSeen > this._windowMs) {
                    if (cluster.incidents.length > 1) {
                        // Emit cluster summary before removing
                        brainBus.emit("prediction.correlation", {
                            clusterId: id,
                            pipeline: cluster.pipeline,
                            rootCause: cluster.rootCause,
                            incidentCount: cluster.incidents.length,
                            incidents: cluster.incidents,
                            recommendation: `${cluster.incidents.length} related incidents in ${cluster.pipeline || "unknown pipeline"} — likely root cause: ${cluster.rootCause}`,
                            timestamp: new Date().toISOString()
                        }, { source: "CorrelationEngine" });
                    }
                    this._clusters.delete(id);
                }
            }

            let cluster = this._clusters.get(clusterKey);
            if (!cluster) {
                cluster = {
                    id: `cluster-${Date.now()}`,
                    pipeline: incident.pipeline,
                    rootCause: incident.type || incident.code,
                    incidents: [],
                    firstSeen: now,
                    lastSeen: now
                };
                this._clusters.set(clusterKey, cluster);
            }

            cluster.incidents.push({
                flowId: incident.flowId,
                type: incident.type,
                severity: incident.severity,
                diagnosis: incident.diagnosis,
                timestamp: new Date().toISOString()
            });
            cluster.lastSeen = now;

            // If cluster grows, emit early warning
            if (cluster.incidents.length === 3) {
                brainBus.emit("prediction.correlation", {
                    clusterId: cluster.id,
                    pipeline: cluster.pipeline,
                    rootCause: cluster.rootCause,
                    incidentCount: cluster.incidents.length,
                    recommendation: `3 related incidents detected in ${cluster.pipeline || "unknown pipeline"} — monitoring for pattern.`,
                    timestamp: new Date().toISOString()
                }, { source: "CorrelationEngine" });
            }
        });

        console.log("[CorrelationEngine] ✅ Grouping incidents by pipeline + type — 5 min windows");
    }

    getClusters() {
        const result = [];
        for (const [key, cluster] of this._clusters) {
            result.push({
                clusterId: cluster.id,
                pipeline: cluster.pipeline,
                rootCause: cluster.rootCause,
                count: cluster.incidents.length,
                firstSeen: new Date(cluster.firstSeen).toISOString(),
                lastSeen: new Date(cluster.lastSeen).toISOString()
            });
        }
        return result.sort((a, b) => b.count - a.count);
    }
}

const correlationEngine = new CorrelationEngine();
export default correlationEngine;
