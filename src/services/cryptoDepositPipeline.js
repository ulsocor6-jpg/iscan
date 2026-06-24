import CryptoDeposit from "../models/cryptoDepositModel.js";

export async function createDetectedDeposit({
  userId,
  token,
  amount,
  txHash,
  address,
  chain
}) {
  return CryptoDeposit.create({
    userId,
    token,
    usdAmount: Number(amount),
    expectedAddress: address,
    detectedTxHash: txHash,
    chainId: chain,
    status: "deposit_detected"
  });
}
