// src/intelligence/stageTimeline.js
// ────────────────────────────────────────────────────────────────────────────
// Turns systemKnowledge's declared pipeline stages + an Inspector flow's
// observed stages[] into one status-per-stage timeline: "done" | "failed" |
// "active" | "never" | "pending".
//
// This is the shared source of truth so Swap Inspector, System Inspector,
// Blockchain Inspector, and Reconciliation all render the same stage bar
// instead of each screen hand-rolling its own STAGE_FOR_STATUS map (which is
// how SwapInspector.tsx currently does it, purely from FlowerOrder.status —
// that only works for one pipeline and can't express "never reached").
// ────────────────────────────────────────────────────────────────────────────

import systemKnowledge from "./systemKnowledge.js";

/**
 * @param {string} pipelineName - key into systemKnowledge.pipelines (e.g. "FLOWER_SWAP")
 * @param {{ name: string, status: string }[]} observedStages - flow.stages from the Inspector doc
 * @param {string} flowStatus - flow.status ("RUNNING" | "SUCCESS" | "FAILED")
 * @returns {{ name: string, status: "done"|"failed"|"active"|"never"|"pending" }[]}
 */
export function buildStageTimeline(pipelineName, observedStages = [], flowStatus = "RUNNING") {
  const pipeline = systemKnowledge.getPipeline(pipelineName);
  const requiredTail = pipeline ? pipeline.stages : observedStages.map(s => s.name);

  const byName = new Map(observedStages.map(s => [s.name, s]));

  // Furthest index in the required tail that has any recorded entry —
  // same logic reasoningEngine.analyzeFlow uses, kept in sync deliberately.
  let furthestIndex = -1;
  for (let i = 0; i < requiredTail.length; i++) {
    if (byName.has(requiredTail[i])) furthestIndex = i;
  }

  const failedName = observedStages.find(s => s.status === "FAILED")?.name;
  const failedIndex = failedName ? requiredTail.indexOf(failedName) : -1;

  return requiredTail.map((stageName, i) => {
    const observed = byName.get(stageName);

    if (observed?.status === "FAILED") return { name: stageName, status: "failed" };
    if (observed?.status === "SUCCESS") return { name: stageName, status: "done" };
    if (observed?.status === "SKIPPED") return { name: stageName, status: "done" };
    if (observed?.status === "RUNNING") return { name: stageName, status: "active" };

    // Not observed at all. If a later-than-this stage failed (or the flow
    // is FAILED and we're past the failure point), this stage never ran —
    // distinct from "hasn't gotten there yet on an otherwise-healthy flow".
    if (failedIndex !== -1 && i > failedIndex) return { name: stageName, status: "never" };
    if (flowStatus === "SUCCESS" && i <= furthestIndex) return { name: stageName, status: "done" };

    return { name: stageName, status: "pending" };
  });
}

export default { buildStageTimeline };
