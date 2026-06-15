import settlementWorker from "./settlementWorker.js";
import { settlementQueue } from "./settlementQueue.js";

export function startSettlementWorker() {
  if (settlementQueue && typeof settlementQueue.process === "function") {
    settlementQueue.process("finalize-transfer", async (job) => {
      return settlementWorker(job);
    });
  } else {
    console.warn("[settlement] settlementQueue.process not available - settlement worker not started");
  }

  console.log("Settlement worker running");
}
