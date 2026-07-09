// src/services/treasury/treasurySendService.js
// Sends real USDC or USDT from BASE_TREASURY_WALLET to user's HD-derived Base address.
// Called after ledger entries are committed in phpSettlementService.settlePHPToStablecoin.

import { ethers } from "ethers";
import Wallet from "../../models/walletModel.js";
import { getOrCreateBaseDepositAddress } from "../flower/baseWalletService.js";
import inspector from "../blockchain/inspector/blockchainInspector.js";

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
const TOKEN_CONTRACTS = {
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
  let toAddress = null;

  if (walletDoc) {
    const baseChain = walletDoc.chainAddresses?.find(
      (ca) => ca.chain === "BASE"
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

// ──────────────────────────────────────────────────────────────────────────
// Withdrawal payouts — sends to an EXTERNAL, user-supplied address.
//
// This is deliberately separate from sendStablecoinToUser above, which
// always resolves the recipient to the user's own custodial deposit
// address (correct for crediting after a PHP→stablecoin swap, wrong for
// a withdrawal — a withdrawal has to leave the platform).
// ──────────────────────────────────────────────────────────────────────────

const CHAIN_CONFIG = {
  BASE: {
    rpc: process.env.BASE_RPC || process.env.BASE_RPC_URL,
    treasuryWallet: process.env.BASE_TREASURY_WALLET,
    treasuryPrivateKey: process.env.BASE_TREASURY_PRIVATE_KEY,
    tokens: {
      USDC: process.env.BASE_USDC_TOKEN,
      USDT: process.env.BASE_USDT_TOKEN,
      FLOWER: process.env.BASE_DEPOSIT_TOKEN,
    },
  },
  RONIN: {
    rpc: process.env.RONIN_RPC,
    treasuryWallet: process.env.RONIN_TREASURY_WALLET,
    treasuryPrivateKey: process.env.RONIN_TREASURY_PRIVATE_KEY,
    tokens: {
      USDC: process.env.RONIN_USDC_TOKEN,
      USDT: process.env.RONIN_USDT_TOKEN, // NOTE: currently unset in .env — will throw a clear error below rather than silently no-op
      FLOWER: process.env.FLOWER_TOKEN,
    },
  },
};

/**
 * Send USDC, USDT, or FLOWER from the treasury wallet on a given chain to
 * an external, user-supplied destination address — i.e. an actual
 * withdrawal payout, as opposed to sendStablecoinToUser's internal credit.
 *
 * @param chain       - "BASE" | "RONIN"
 * @param currency    - "USDC" | "USDT" | "FLOWER"
 * @param amount      - human-readable amount (e.g. 12.50)
 * @param toAddress   - external destination address the user provided
 * @param txRef       - reference ID for logging (e.g. `WD-<withdrawalId>`)
 */
export async function sendCryptoToAddress({
  chain,
  currency,
  amount,
  toAddress,
  txRef,
}) {
  const chainKey = (chain || "").toUpperCase();
  const config = CHAIN_CONFIG[chainKey];

  if (!config) {
    throw new Error(`Unsupported withdrawal chain: "${chain}". Supported: BASE, RONIN`);
  }
  if (!config.rpc) {
    throw new Error(`No RPC endpoint configured for ${chainKey}`);
  }
  if (!config.treasuryPrivateKey) {
    throw new Error(`No treasury private key configured for ${chainKey}`);
  }
  if (!ethers.isAddress(toAddress)) {
    throw new Error(`Invalid destination address: "${toAddress}"`);
  }

  const contractAddress = config.tokens[currency];
  if (!contractAddress) {
    throw new Error(
      `No ${currency} contract configured for ${chainKey} — check the relevant env var ` +
      `(this asset/chain combination may not be set up yet).`
    );
  }

  inspector.info(
    "TreasurySendService",
    `Sending ${amount} ${currency} on ${chainKey} → ${toAddress}`,
    { chain: chainKey, token: currency, amount, to: toAddress, txRef }
  );

  try {
    const provider = new ethers.JsonRpcProvider(config.rpc);
    const signer   = new ethers.Wallet(config.treasuryPrivateKey, provider);
    const token    = new ethers.Contract(contractAddress, ERC20_ABI, signer);

    const decimals     = await token.decimals();
    const amountWei    = ethers.parseUnits(amount.toFixed(Number(decimals)), decimals);
    const treasuryAddr = config.treasuryWallet || signer.address;
    const treasuryBal  = await token.balanceOf(treasuryAddr);

    if (treasuryBal < amountWei) {
      throw new Error(
        `Treasury ${currency} balance insufficient on ${chainKey}. ` +
        `Have: ${ethers.formatUnits(treasuryBal, decimals)}, Need: ${amount}`
      );
    }

    const tx      = await token.transfer(toAddress, amountWei);
    const receipt = await tx.wait();

    inspector.success(
      "TreasurySendService",
      `Sent ${amount} ${currency} on ${chainKey} → ${toAddress}`,
      { chain: chainKey, token: currency, amount, to: toAddress, txHash: receipt.hash, txRef }
    );

    return {
      txHash: receipt.hash,
      toAddress,
      amount,
      currency,
      chain: chainKey,
      txRef,
    };
  } catch (err) {
    inspector.error(
      "TreasurySendService",
      `Failed to send ${amount} ${currency} on ${chainKey}: ${err.message}`,
      { chain: chainKey, token: currency, amount, to: toAddress, txRef }
    );
    throw err;
  }
}

export default { sendStablecoinToUser, sendCryptoToAddress };
