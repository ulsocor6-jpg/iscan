import brainBus from "../brainbus/brainBus.js";
import DirectDeposit from "../models/DirectDepositModel.js";
import { archiveDeposit } from "./depositArchiveService.js";
import healthRegistry from "../intelligence/healthRegistry.js";

export async function expireDeposits() {
  const expired = await DirectDeposit.find({
    status: "PENDING",
    expiresAt: {
      $lt: new Date()
    }
  });

  console.log(
    `[DepositExpiry] Found ${expired.length} expired deposits`
  );

  for (const deposit of expired) {
    await archiveDeposit(
      deposit,
      "EXPIRED",
      {
        expiredAt: new Date()
      }
    );

    console.log(
      `[DepositExpiry] Archived ${deposit.referenceId}`
    );
  }
}

export function startDepositExpiryWorker() {

  console.log(
    "[DepositExpiry] Worker started"
  );

  healthRegistry.registerNode({ node: "depositExpiry", type: "worker" });

  healthRegistry.report({ node: "depositExpiry", status: "ONLINE" });

  function tick() {
    expireDeposits()
      .then(() => {
        healthRegistry.report({ node: "depositExpiry", status: "ONLINE", metrics: { lastRunAt: new Date() } });
      })
      .catch((err) => {
        console.error("[DepositExpiry] Failed:", err.message);
        healthRegistry.report({ node: "depositExpiry", status: "WARNING", error: err.message });
      });
  }

  tick();

  setInterval(tick, 60 * 1000);
}
