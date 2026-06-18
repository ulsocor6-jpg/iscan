// src/services/flowerWalletService.js

import Wallet           from "../../models/walletModel.js";
import DepositAddress   from "../../models/depositAddressModel.js";
import { deriveRoninAddress } from "../hdWalletService.js";

// Count existing Ronin assignments → next unique HD index
async function getNextRoninIndex() {
  return await Wallet.countDocuments({
    "chainAddresses.chain": "RONIN"
  });
}

// Get or create Ronin deposit address for a user
export async function getOrCreateRoninDepositAddress(userId) {
  const walletDoc = await Wallet.findOne({ userId });
  if (!walletDoc) throw new Error(`No wallet found for user ${userId}.`);

  // Already assigned — return existing
  const existing = walletDoc.chainAddresses.find(ca => ca.chain === "RONIN");
  if (existing?.address) {
    return { address: existing.address, chain: "RONIN", chainId: "0x7e4", isNew: false };
  }

  // Derive next unique index
  const index       = await getNextRoninIndex();
  const roninWallet = await deriveRoninAddress(index);

  if (!roninWallet?.address) {
    throw new Error("Failed to derive Ronin address — check HD_WALLET_MNEMONIC");
  }

  // 1. Store in walletModel chainAddresses
  await Wallet.updateOne(
    { userId },
    {
      $push: {
        chainAddresses: {
          chain:       "RONIN",
          address:     roninWallet.address,
          chainId:     "0x7e4",
          usdtBalance: 0,
          usdcBalance: 0
        }
      }
    }
  );

  // 2. Store in DepositAddress collection with hdIndex for sweep
  await DepositAddress.create({
    userId,
    chain:   "RONIN",
    token:   "FLOWER",
    address: roninWallet.address,
    status:  "active",
    hdIndex: index  // used by sweep service to re-derive private key
  });

  console.log(`[FlowerWallet] Assigned ${roninWallet.address} to user ${userId} (index: ${index})`);
  return { address: roninWallet.address, chain: "RONIN", chainId: "0x7e4", index, isNew: true };
}

// Find deposit address record by Ronin address (includes hdIndex)
export async function getDepositRecord(roninAddress) {
  return await DepositAddress.findOne({
    chain:   "RONIN",
    address: roninAddress.toLowerCase()
  });
}

// Find user by their Ronin deposit address
export async function findUserByRoninAddress(roninAddress) {
  const record = await DepositAddress.findOne({
    chain:   "RONIN",
    address: roninAddress.toLowerCase()
  });
  return record?.userId ?? null;
}

// Backfill all users without a Ronin address
export async function provisionAllRoninAddresses() {
  const walletsWithoutRonin = await Wallet.find({
    $or: [
      { chainAddresses: { $size: 0 } },
      { chainAddresses: { $not: { $elemMatch: { chain: "RONIN" } } } }
    ]
  });

  console.log(`[FlowerWallet] Provisioning ${walletsWithoutRonin.length} users`);
  let success = 0, failed = 0;

  for (const walletDoc of walletsWithoutRonin) {
    try {
      await getOrCreateRoninDepositAddress(walletDoc.userId);
      success++;
    } catch (err) {
      console.error(`[FlowerWallet] Failed for ${walletDoc.userId}:`, err.message);
      failed++;
    }
  }

  return { success, failed, total: walletsWithoutRonin.length };
}

export default {
  getOrCreateRoninDepositAddress,
  getDepositRecord,
  findUserByRoninAddress,
  provisionAllRoninAddresses
};
