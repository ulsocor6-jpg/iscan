import Wallet from "../../../models/walletModel.js";
import { getLiveBalancesForWallet } from "../../onchainBalanceService.js";
import { getPendingSweepTotalsByChain } from "../../flower/flowerPendingSweepService.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function syncWallet(wallet) {
  const live = await getLiveBalancesForWallet(wallet);
  const pendingSweep = await getPendingSweepTotalsByChain(wallet.userId);

  let dirty = false;

  for (const ca of wallet.chainAddresses) {
    const chainKey = ca.chain?.toUpperCase();
    const data = live[chainKey];

    if (!data || data.error) continue;

    if (typeof data.native === "number") {
      ca.nativeBalance = data.native;
    }

    if (typeof data.FLOWER === "number") {
      // Net out FLOWER already credited by a completed swap but not yet
      // physically swept to treasury -- otherwise the displayed balance
      // doesn't drop after a swap (or looks like it went up) until the
      // next sweep batch runs. See flowerPendingSweepService.js.
      const pending = pendingSweep[chainKey] || 0;
      ca.flowerBalance = Math.max(0, data.FLOWER - pending);
    }

    if (typeof data.USDC === "number") {
      ca.usdcBalance = data.USDC;
    }

    if (typeof data.USDT === "number") {
      ca.usdtBalance = data.USDT;
    }

    ca.lastSynced = new Date();
    dirty = true;
  }

  if (dirty) {
    await wallet.save();
  }

  return {
    wallet,
    live,
    updated: dirty,
  };
}

export async function syncWalletBalance(userId) {
  const wallet = await Wallet.findOne({
    userId,
    "chainAddresses.0": { $exists: true },
  });

  if (!wallet) {
    return {
      success: false,
      reason: "wallet_not_found",
    };
  }

  try {
    const result = await syncWallet(wallet);

    return {
      success: true,
      ...result,
    };
  } catch (err) {
    const isLegacyShape = err.name === "ValidationError";
    const logFn = isLegacyShape ? console.warn : console.error;

    logFn(
      `[WalletBalanceSync] ${
        isLegacyShape
          ? "Skipped legacy-shaped wallet"
          : "Failed"
      } for user ${wallet.userId}:`,
      err.message
    );

    return {
      success: false,
      reason: err.message,
    };
  }
}

export async function syncWalletBalances() {
  const wallets = await Wallet.find({
    "chainAddresses.0": { $exists: true },
  });

  let walletsUpdated = 0;
  let walletsFailed = 0;

  for (const wallet of wallets) {
    try {
      const result = await syncWallet(wallet);

      if (result.updated) {
        walletsUpdated++;
      }
    } catch (err) {
      walletsFailed++;

      const isLegacyShape = err.name === "ValidationError";
      const logFn = isLegacyShape ? console.warn : console.error;

      logFn(
        `[WalletBalanceSync] ${
          isLegacyShape
            ? "Skipped legacy-shaped wallet"
            : "Failed"
        } for user ${wallet.userId}:`,
        err.message
      );
    }
  }

  console.log(
    `[WalletBalanceSync] Done. ${walletsUpdated} wallet(s) updated, ${walletsFailed} failure(s).`
  );
}

export function startWalletBalanceSyncWorker() {
  console.log("[WalletBalanceSync] Worker started");

  syncWalletBalances().catch((err) =>
    console.error(
      "[WalletBalanceSync] Initial run failed:",
      err.message
    )
  );

  setInterval(() => {
    syncWalletBalances().catch((err) =>
      console.error(
        "[WalletBalanceSync] Run failed:",
        err.message
      )
    );
  }, SYNC_INTERVAL_MS);
}

export default {
  startWalletBalanceSyncWorker,
  syncWalletBalances,
  syncWalletBalance,
};
