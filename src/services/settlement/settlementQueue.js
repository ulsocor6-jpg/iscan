const queue = [];

/**
 * Add settlement job
 */
export function enqueueSettlement(job) {
  queue.push({
    ...job,
    attempts: 0,
    status: "pending",
    createdAt: Date.now()
  });
}

/**
 * Get next job
 */
export function getNextJob() {
  return queue.find(j => j.status === "pending");
}

/**
 * Update job
 */
export function updateJob(jobId, update) {
  const job = queue.find(j => j.jobId === jobId);
  if (job) Object.assign(job, update);
}

export function getQueue() {
  return queue;
}

// ── Compatibility shim added by fix_and_wire.sh ──────────────────────────
// Provides a minimal .process() based queue interface expected by
// src/services/settlement/index.js
const handlers = {};
export const settlementQueue = {
  process(name, fn) {
    handlers[name] = fn;
  },
  async run(name, job) {
    if (handlers[name]) return handlers[name](job);
    throw new Error(`No handler registered for "${name}"`);
  },
};
