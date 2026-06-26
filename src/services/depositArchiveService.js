import DepositLog from "../models/DepositLog.js";
import DirectDeposit from "../models/DirectDepositModel.js";

export async function archiveDeposit(
  deposit,
  status,
  extra = {}
) {
  const obj = deposit.toObject
    ? deposit.toObject()
    : deposit;

  delete obj._id;

  await DepositLog.create({
    ...obj,
    status,
    ...extra
  });

  await DirectDeposit.deleteOne({
    _id: deposit._id
  });
}
