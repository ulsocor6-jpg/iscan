import DirectDeposit from "../models/DirectDepositModel.js";
import { archiveDeposit } from "./depositArchiveService.js";

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

  expireDeposits();

  setInterval(
    expireDeposits,
    60 * 1000
  );
}
