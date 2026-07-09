import CryptoDeposit from "../models/cryptoDepositModel.js";
import Wallet from "../models/walletModel.js";

export async function createDetectedDeposit({
  userId,
  token,
  amount,
  txHash,
  address,
  chain,
}) {

  // Atomic idempotent insert
  const deposit = await CryptoDeposit.findOneAndUpdate(
    { txHash },
    {
      $setOnInsert: {
        userId,
        token,
        amount,
        txHash,
        address,
        chain,
        status: "processing",
      },
    },
    {
      upsert: true,
      new: true,
      rawResult: true,
    }
  );

  // Already processed previously
  if (!deposit.lastErrorObject.upserted) {
    console.log(
      `[PIPELINE] Duplicate tx ignored ${txHash}`
    );
    return null;
  }

  try {

    await Wallet.findOneAndUpdate(
      { userId },
      {
        $inc: {
          [`balances.${token}`]: amount,
        },
      },
      {
        upsert: true,
      }
    );

    await CryptoDeposit.updateOne(
      { txHash },
      {
        $set: {
          status: "completed",
          creditedAt: new Date(),
        },
      }
    );

    console.log(
      `[PIPELINE] Credited ${amount} ${token}`
    );

  } catch (err) {

    await CryptoDeposit.updateOne(
      { txHash },
      {
        $set: {
          status: "failed",
          error: err.message,
        },
      }
    );

    throw err;
  }

  return deposit.value;
}
