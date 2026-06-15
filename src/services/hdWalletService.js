import { ethers } from "ethers";
import * as bip39 from "bip39";
import crypto from "crypto";

const MASTER_MNEMONIC = process.env.HD_WALLET_MNEMONIC;
const MASTER_SEED = process.env.HD_WALLET_SEED;

/**
 * Derive a unique TRC20-compatible address for a user
 * Uses BIP44 derivation: m/44'/195'/0'/0/{index}
 * TRON uses the same elliptic curve as Ethereum (secp256k1)
 * so we derive ETH-style and convert to TRON format
 */
export async function deriveUserAddress(userIndex) {
  if (!MASTER_MNEMONIC && !MASTER_SEED) {
    // Fallback: deterministic pseudo-address for MVP (not real HD wallet)
    const seed = process.env.HD_WALLET_SEED || "iscan-default-seed";
    const hash = crypto.createHash("sha256")
      .update(seed + "-" + userIndex)
      .digest("hex");
    return {
      address: "T" + hash.slice(0, 33).toUpperCase(),
      index: userIndex,
      mock: true
    };
  }

  const mnemonic = MASTER_MNEMONIC;
  const hdNode = ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    "m/44'/195'/0'/0"
  );
  const child = hdNode.deriveChild(userIndex);

  // Convert ETH address to TRON format (T + base58)
  // For MVP: use ETH address with T prefix as placeholder
  const ethAddress = child.address;
  const tronAddress = "T" + ethAddress.slice(2, 35).toUpperCase();

  return {
    address: tronAddress,
    ethAddress,
    privateKey: child.privateKey,
    index: userIndex,
    mock: false
  };
}

/**
 * Get next available index for new user
 */
export async function getNextWalletIndex() {
  const { default: DepositAddress } = await import("../models/depositAddressModel.js");
  const count = await DepositAddress.countDocuments();
  return count;
}
