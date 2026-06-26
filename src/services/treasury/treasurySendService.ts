// src/services/treasury/treasurySendService.js
// Sends real USDC or USDT from BASE_TREASURY_WALLET to user's HD-derived Base address.
// Called after ledger entries are committed in phpSettlementService.settlePHPToStablecoin.

import { ethers } from "ethers";
import Wallet from "../../models/walletModel.js";
import { getOrCreateBaseDepositAddress } from "../flower/baseWalletService.js";

const BASE_RPC             = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const TREASURY_PRIVATE_KEY = process.env.BASE_TREASURY_PRIVATE_KEY;
const TREASURY_WALLET      = process.env.BASE_TREASURY_WALLET;

// ERC-20 minimal ABI — transfer + balanceOf
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
];

// Token contract addresses on Base
const TOKEN_CONTRACTS: Record<string, string> = {
  USDC: process.env.BASE_USDC_TOKEN  || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: process.env.BASE_USDT_TOKEN  || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

/**
 * Send USDC or USDT from treasury wallet to user's Base address.
 * @param userId    - MongoDB user ID
 * @param currency  - "USDC" | "USDT"
 * @param amount    - human-readable amount (e.g. 12.50)
 * @param txRef     - reference ID for logging
 */
export async function sendStablecoinToUser({
  userId,
  currency,
  amount,
  txRef,
}: {
  userId: string;
  currency: string;
  amount: number;
  txRef: string;
}) {
  if (!TREASURY_PRIVATE_KEY) {
    throw new Error("BASE_TREASURY_PRIVATE_KEY not configured");
  }

  const contractAddress = TOKEN_CONTRACTS[currency];
  if (!contractAddress) {
    throw new Error(`No contract address configured for ${currency} on Base`);
  }

  // ── Get user's Base address from their wallet ────────────────────────────
  const walletDoc = await Wallet.findOne({ userId });
  let toAddress: string | null = null;

  if (walletDoc) {
    const baseChain = walletDoc.chainAddresses?.find(
      (ca: any) => ca.chain === "BASE"
    );
    toAddress = baseChain?.address ?? null;
  }

  // If no Base address yet, derive and assign one
  if (!toAddress) {
    const derived = await getOrCreateBaseDepositAddress(userId);
    toAddress = derived.address;
  }

  if (!toAddress) {
    throw new Error(`Could not resolve Base address for user ${userId}`);
  }

  console.log(
    `[Treasury] Sending ${amount} ${currency} from treasury → ${toAddress} (ref: ${txRef})`
  );

  // ── Set up provider + signer ─────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const signer   = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
  const token    = new ethers.Contract(contractAddress, ERC20_ABI, signer);

  // ── Check treasury balance before sending ────────────────────────────────
  const decimals      = await token.decimals();
  const amountWei     = ethers.parseUnits(amount.toFixed(Number(decimals)), decimals);
  const treasuryBal   = await token.balanceOf(TREASURY_WALLET || signer.address);

  if (treasuryBal < amountWei) {
    throw new Error(
      `Treasury ${currency} balance insufficient. ` +
      `Have: ${ethers.formatUnits(treasuryBal, decimals)}, ` +
      `Need: ${amount}`
    );
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  const tx      = await token.transfer(toAddress, amountWei);
  const receipt = await tx.wait();

  console.log(
    `[Treasury] ✅ Sent ${amount} ${currency} → ${toAddress} | tx: ${receipt.hash} (ref: ${txRef})`
  );

  return {
    txHash:    receipt.hash,
    toAddress,
    amount,
    currency,
    txRef,
  };
}

export default { sendStablecoinToUser };
