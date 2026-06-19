// src/services/flower/baseWalletService.js

import Wallet           from "../../models/walletModel.js";
import DepositAddress   from "../../models/depositAddressModel.js";
import { deriveBaseAddress } from "../hdWalletService.js";

// Count existing Base assignments → next unique HD index
async function getNextBaseIndex() {
  const last = await DepositAddress
    .findOne({ chain: "base" })
    .sort({ hdIndex: -1 });

  return last ? last.hdIndex + 1 : 0;
}

// Get or create Base deposit address for a user
export async function getOrCreateBaseDepositAddress(userId) {
  const walletDoc = await Wallet.findOne({ userId });
  if (!walletDoc) throw new Error(`No wallet found for user ${userId}.`);

  // Already assigned — return existing
  const existing = walletDoc.chainAddresses.find(ca => ca.chain === "BASE");
  if (existing?.address) {
    return { address: existing.address, chain: "base", chainId: "0x2105", isNew: false };
  }

  // Derive next unique index
  const index     = await getNextBaseIndex();
  const baseWallet = await deriveBaseAddress(index);

  if (!baseWallet?.address) {
    throw new Error("Failed to derive Base address — check HD_WALLET_MNEMONIC");
  }

  // 1. Store in walletModel chainAddresses (uppercase, matches SUPPORTED_CHAINS convention)
  await Wallet.updateOne(
    { userId },
    {
      $push: {
        chainAddresses: {
          chain:       "BASE",
          address:     baseWallet.address,
          chainId:     "0x2105",
          usdtBalance: 0,
          usdcBalance: 0
        }
      }
    }
  );

  // 2. Store in DepositAddress collection with hdIndex for sweep (lowercase, matches baseListener)
  await DepositAddress.create({
    userId,
    chain:   "base",
    token:   "FLOWER",
    address: baseWallet.address,
    status:  "active",
    hdIndex: index
  });

  console.log(`[BaseWallet] Assigned ${baseWallet.address} to user ${userId} (index: ${index})`);
  return { address: baseWallet.address, chain: "base", chainId: "0x2105", index, isNew: true };
}

// Find deposit address record by Base address (includes hdIndex)
export async function getDepositRecord(baseAddress) {
  return await DepositAddress.findOne({
    chain:   "base",
    address: baseAddress.toLowerCase()
  });
}

// Find user by their Base deposit address
export async function findUserByBaseAddress(baseAddress) {
  const record = await DepositAddress.findOne({
    chain:   "base",
    address: baseAddress.toLowerCase()
  });
  return record?.userId ?? null;
}

// Backfill all users without a Base address
export async function provisionAllBaseAddresses() {
  const walletsWithoutBase = await Wallet.find({
    $or: [
      { chainAddresses: { $size: 0 } },
      { chainAddresses: { $not: { $elemMatch: { chain: "BASE" } } } }
    ]
  });

  console.log(`[BaseWallet] Provisioning ${walletsWithoutBase.length} users`);
  let success = 0, failed = 0;

  for (const walletDoc of walletsWithoutBase) {
    try {
      await getOrCreateBaseDepositAddress(walletDoc.userId);
      success++;
    } catch (err) {
      console.error(`[BaseWallet] Failed for ${walletDoc.userId}:`, err.message);
      failed++;
    }
  }

  return { success, failed, total: walletsWithoutBase.length };
}

export default {
  getOrCreateBaseDepositAddress,
  getDepositRecord,
  findUserByBaseAddress,
  provisionAllBaseAddresses
};
