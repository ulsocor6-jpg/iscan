import {
  getNextJob,
  updateJob
} from "./settlementQueue.js";

import { processSettlement } from "./settlementProcessor.js";
import { getRetryDelay, canRetry } from "./retryPolicy.js";

/**
 * Continuous worker loop
 */
export async function startSettlementWorker() {
  console.log("[SETTLEMENT WORKER] started");

  setInterval(async () => {
    const job = getNextJob();

    if (!job) return;

    try {
      job.status = "processing";
      job.attempts++;

      await processSettlement(job);

      job.status = "completed";

    } catch (err) {
      console.log("[SETTLEMENT FAILED]", err.message);

      if (!canRetry(job.attempts)) {
        job.status = "failed";
        job.error = err.message;
        return;
      }

      job.status = "retrying";

      const delay = getRetryDelay(job.attempts);

      setTimeout(() => {
        job.status = "pending";
      }, delay);
    }

  }, 2000);
}
