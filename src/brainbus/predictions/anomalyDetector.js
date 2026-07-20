// src/brainbus/predictions/anomalyDetector.js
// ────────────────────────────────────────────────────────────────────────────
// Lightweight anomaly detection on flow patterns.
// Tracks stage durations, failure rates, and sequence deviations across
// all flows. When a pattern deviates from historical norms, emits a
// prediction.anomaly event so the Operator can proactively investigate.
// ────────────────────────────────────────────────────────────────────────────

import brainBus from "../brainBus.js";
import { Channels } from "../channels.js";
import liveMemoryStore from "../liveMemoryStore.js";

class AnomalyDetector {
    constructor() {
        // Rolling window stats per pipeline + stage
        this._stats = new Map(); // key: "pipeline:stage" → { durations: [], failures: 0, total: 0 }
        this._windowSize = 50;   // last N observations per stage
        this._started = false;

        // Thresholds
        this._durationZScore = 2.5;  // flag if duration > 2.5 stddev above mean
        this._failureRateThreshold = 0.3; // flag if >30% failure rate in window
        this._gapThreshold = 3;     // flag if >3 flows have gaps in last 5 min
    }

    start() {
        if (this._started) return;
        this._started = true;

        // ── Track stage completions ─────────────────────────────────────
        brainBus.on(Channels.INSPECTOR_FLOW_STAGE, (envelope) => {
            const { flowId, pipeline, stage, data } = envelope.payload;
            if (!pipeline || !stage) return;

            const key = `${pipeline}:${stage}`;
            if (!this._stats.has(key)) {
                this._stats.set(key, { durations: [], failures: 0, total: 0, recentGaps: [] });
            }

            const stat = this._stats.get(key);
            stat.total++;

            if (data?.status === "FAILED") {
                stat.failures++;
            }

            if (data?.durationMs && data.status === "SUCCESS") {
                stat.durations.push(data.durationMs);
                if (stat.durations.length > this._windowSize) stat.durations.shift();

                // Check for duration anomaly
                const anomaly = this._checkDurationAnomaly(key, pipeline, stage, data.durationMs);
                if (anomaly) {
                    brainBus.emit("prediction.anomaly", anomaly, {
                        source: "AnomalyDetector",
                        correlationId: flowId
                    });
                }
            }

            // Check failure rate
            if (stat.total >= 10) {
                const failureRate = stat.failures / stat.total;
                if (failureRate > this._failureRateThreshold) {
                    brainBus.emit("prediction.anomaly", {
                        type: "HIGH_FAILURE_RATE",
                        pipeline,
                        stage,
                        failureRate: (failureRate * 100).toFixed(1) + "%",
                        failures: stat.failures,
                        total: stat.total,
                        recommendation: `Stage "${stage}" in "${pipeline}" failing at ${(failureRate * 100).toFixed(0)}% — investigate root cause.`,
                        timestamp: new Date().toISOString()
                    }, { source: "AnomalyDetector" });
                    stat.failures = 0;
                    stat.total = 0; // reset window after alert
                }
            }
        });

        // ── Track flow deviations for gap pattern detection ────────────
        brainBus.on(Channels.INSPECTOR_FLOW_DEVIATION, (envelope) => {
            const { flowId, reasoning } = envelope.payload;
            const key = `${reasoning?.verdict || "UNKNOWN"}`;

            if (!this._stats.has("__deviations__")) {
                this._stats.set("__deviations__", { recentGaps: [], timestamps: [] });
            }
            const devStats = this._stats.get("__deviations__");
            devStats.recentGaps.push({ flowId, verdict: reasoning?.verdict, timestamp: Date.now() });
            devStats.timestamps.push(Date.now());

            // Keep last 5 minutes
            const cutoff = Date.now() - 5 * 60 * 1000;
            devStats.recentGaps = devStats.recentGaps.filter(g => g.timestamp > cutoff);
            devStats.timestamps = devStats.timestamps.filter(t => t > cutoff);

            if (devStats.recentGaps.length >= this._gapThreshold) {
                brainBus.emit("prediction.anomaly", {
                    type: "DEVIATION_CLUSTER",
                    count: devStats.recentGaps.length,
                    window: "5 minutes",
                    recommendation: `${devStats.recentGaps.length} flow deviations in 5 min — possible systemic issue. Check recent deployments or RPC health.`,
                    timestamp: new Date().toISOString()
                }, { source: "AnomalyDetector" });
                devStats.recentGaps = [];
                devStats.timestamps = [];
            }
        });

        console.log("[AnomalyDetector] ✅ Tracking stage durations, failure rates, and deviation clusters");
    }

    _checkDurationAnomaly(key, pipeline, stage, durationMs) {
        const stat = this._stats.get(key);
        if (!stat || stat.durations.length < 10) return null; // need enough data

        const mean = stat.durations.reduce((a, b) => a + b, 0) / stat.durations.length;
        const variance = stat.durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / stat.durations.length;
        const stddev = Math.sqrt(variance);
        if (stddev === 0) return null;

        const zScore = (durationMs - mean) / stddev;
        if (zScore > this._durationZScore) {
            return {
                type: "SLOW_STAGE",
                pipeline,
                stage,
                durationMs,
                meanMs: Math.round(mean),
                stddevMs: Math.round(stddev),
                zScore: zScore.toFixed(1),
                recommendation: `Stage "${stage}" took ${durationMs}ms — ${zScore.toFixed(1)}x slower than normal (avg ${Math.round(mean)}ms).`,
                timestamp: new Date().toISOString()
            };
        }
        return null;
    }

    getStats() {
        const result = {};
        for (const [key, stat] of this._stats) {
            if (key === "__deviations__") continue;
            const mean = stat.durations.length > 0
                ? Math.round(stat.durations.reduce((a, b) => a + b, 0) / stat.durations.length)
                : 0;
            result[key] = {
                total: stat.total,
                failures: stat.failures,
                failureRate: stat.total > 0 ? (stat.failures / stat.total * 100).toFixed(1) + "%" : "0%",
                avgDurationMs: mean,
                samples: stat.durations.length
            };
        }
        return result;
    }
}

const anomalyDetector = new AnomalyDetector();
export default anomalyDetector;
