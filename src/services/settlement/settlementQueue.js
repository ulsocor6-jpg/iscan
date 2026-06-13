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
