import CryptoDeposit from "../models/cryptoDepositModel.js";
import Wallet from "../models/walletModel.js";
import { sweepStablecoinToTreasury } from "./treasury/stablecoinSweepService.js";

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
    console.log(`[PIPELINE] Duplicate tx ignored ${txHash}`);
    return null;
  }

  try {
    // ------------------------------------------------------------------
    // Find the user's wallet so we can derive the HD wallet for sweeping
    // ------------------------------------------------------------------
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      throw new Error(`Wallet not found for user ${userId}`);
    }

    if (wallet.walletIndex === undefined || wallet.walletIndex === null) {
      throw new Error(`walletIndex missing for user ${userId}`);
    }

    // ------------------------------------------------------------------
    // Sweep the deposited stablecoin into treasury FIRST.
    // This service automatically funds gas if needed.
    // ------------------------------------------------------------------
    const sweep = await sweepStablecoinToTreasury({
      chain,
      token,
      walletIndex: wallet.walletIndex,
      amount,
    });

    console.log(
      `[PIPELINE] Swept ${sweep.swept} ${token} to treasury (${sweep.txHash})`
    );

    // ------------------------------------------------------------------
    // Credit internal balance ONLY after treasury custody succeeds
    // ------------------------------------------------------------------
    await Wallet.findOneAndUpdate(
      { userId },
      {
        $inc: {
          [`balances.${token}`]: amount,
        },
      }
    );

    // ------------------------------------------------------------------
    // Mark deposit completed
    // ------------------------------------------------------------------
    await CryptoDeposit.updateOne(
      { txHash },
      {
        $set: {
          status: "completed",
          creditedAt: new Date(),

          // Safe to save even if schema doesn't contain them yet.
          // Mongoose strict mode simply ignores unknown fields until
          // you add them to cryptoDepositModel.js.
          treasurySweepTx: sweep.txHash,
          sweptAmount: sweep.swept,
        },
      }
    );

    console.log(
      `[PIPELINE] Deposit completed: ${amount} ${token} (${txHash})`
    );
  } catch (err) {
    console.error(`[PIPELINE] Deposit failed ${txHash}:`, err);

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
