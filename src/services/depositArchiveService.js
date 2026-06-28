import DepositLog from "../models/DepositLog.js";
import DirectDeposit from "../models/DirectDepositModel.js";

export async function archiveDeposit(deposit, status, extra = {}) {
  // Update status in place — keeps it visible in logs
  await DirectDeposit.findByIdAndUpdate(deposit._id, {
    status,
    ...extra
  });

  // Also write to DepositLog for audit trail
  const obj = deposit.toObject ? deposit.toObject() : deposit;
  delete obj._id;
  await DepositLog.create({ ...obj, status, ...extra });
}
