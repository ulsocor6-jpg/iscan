// src/intelligence/reasoningEngine.js

import systemKnowledge from "./systemKnowledge.js";

// A flow with no new stage activity for this long, while still RUNNING,
// is considered stalled rather than "just about to continue."
const STALL_THRESHOLD_MS = 30 * 1000;

class ReasoningEngine {

    analyzeFlow(flow) {

        if (!flow || !flow.pipeline) return null;

        const pipeline = systemKnowledge.getPipeline(flow.pipeline);

        if (!pipeline) {
            return {
                verdict: "UNKNOWN_PIPELINE",
                message: `No System Knowledge entry for pipeline "${flow.pipeline}" — cannot reason about expected stages.`
            };
        }

        const observed = flow.stages || [];
        const observedNames = observed.map(s => s.name);

        // Terminal exit (e.g. CANCELLED) is a legitimate end state, not a deviation.
        const terminalStage = observed.find(s =>
            systemKnowledge.isTerminalExit(flow.pipeline, s.name)
        );
        if (terminalStage) {
            return {
                verdict: "TERMINATED",
                message: `Flow ended via ${terminalStage.name} — expected exit, not a deviation.`
            };
        }

        const fullSequence = systemKnowledge.getFullSequence(flow.pipeline);
        const requiredTail = pipeline.stages;

        // Furthest index in the required tail that has a recorded entry.
        let furthestIndex = -1;
        for (let i = 0; i < requiredTail.length; i++) {
            if (observedNames.includes(requiredTail[i])) {
                furthestIndex = i;
            }
        }

        // Gap detection: any required stage BEFORE the furthest reached one
        // that has no entry at all is a real deviation (not just "not there yet").
        const missingBeforeFurthest = [];
        for (let i = 0; i < furthestIndex; i++) {
            if (!observedNames.includes(requiredTail[i])) {
                missingBeforeFurthest.push(requiredTail[i]);
            }
        }

        if (missingBeforeFurthest.length > 0) {
            return {
                verdict: "GAP_DETECTED",
                message: `Flow reached "${requiredTail[furthestIndex]}" but never recorded: ${missingBeforeFurthest.join(", ")}. Likely a missing Inspector call in the code path, not an actual skip (no SKIPPED status was recorded).`,
                missingStages: missingBeforeFurthest,
                furthestStage: requiredTail[furthestIndex]
            };
        }

        // Flow completed successfully through the full tail.
        if (furthestIndex === requiredTail.length - 1) {
            const lastStage = observed.find(s => s.name === requiredTail[furthestIndex]);
            if (lastStage?.status === "SUCCESS") {
                return {
                    verdict: "COMPLETE",
                    message: "Flow completed the full expected sequence."
                };
            }
        }

        // Flow is FAILED — the failed stage itself is the root cause, no
        // further gap reasoning needed; failStage() already routes this to
        // incidentEngine separately.
        if (flow.status === "FAILED") {
            const failedStage = observed.find(s => s.status === "FAILED");
            return {
                verdict: "FAILED_AT_STAGE",
                message: failedStage
                    ? `Flow failed at "${failedStage.name}": ${failedStage.error || "no error message recorded"}.`
                    : "Flow marked FAILED but no failed stage entry found — inconsistent state, worth checking manually."
            };
        }

        // Still RUNNING — check for a stall using the most recent stage's timestamp.
        if (flow.status === "RUNNING") {

            const nextExpected = requiredTail[furthestIndex + 1] || null;
            const lastObserved = observed[observed.length - 1];
            const lastActivity = lastObserved?.finishedAt || lastObserved?.startedAt || flow.createdAt;
            const elapsedMs = lastActivity ? Date.now() - new Date(lastActivity).getTime() : 0;

            if (elapsedMs > STALL_THRESHOLD_MS && nextExpected) {
                return {
                    verdict: "STALLED",
                    message: `No stage activity for ${Math.round(elapsedMs / 1000)}s. Expected next stage: "${nextExpected}". This usually means the code path returned or exited without an Inspector call for that stage — check the pipeline code for an early return.`,
                    nextExpected
                };
            }

            return {
                verdict: "IN_PROGRESS",
                message: nextExpected
                    ? `On track. Next expected stage: "${nextExpected}".`
                    : "On track."
            };

        }

        return {
            verdict: "UNKNOWN",
            message: "Could not determine flow state from available data."
        };

    }

}

export default new ReasoningEngine();
