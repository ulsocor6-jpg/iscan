import DirectDeposit from "../models/DirectDepositModel.js";

export async function expireDeposits() {
  const result = await DirectDeposit.updateMany(
    {
      status: "PENDING",
      expiresAt: { $lt: new Date() }
    },
    {
      status: "EXPIRED"
    }
  );

  console.log("[DepositExpiry]", result.modifiedCount, "expired");
}
