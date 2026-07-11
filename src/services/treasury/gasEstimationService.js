// src/services/treasury/gasEstimationService.js
//
// Real-time network fee estimation for treasury-outbound sends (withdrawals).
// Replaces static guessed fees with a live dry-run estimate + live gas price,
// converted into whatever asset the user is actually withdrawing.

import { ethers } from "ethers";
import priceAggregator from "../routing/priceAggregator.js";
import { getFlowerUsdtRate } from "../flower/flowerUsdtSwapService.js";

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
];

const CHAIN_CONFIG = {
  BASE: {
    rpc: process.env.BASE_RPC || process.env.BASE_RPC_URL,
    treasuryWallet: process.env.BASE_TREASURY_WALLET,
    nativeCoingeckoId: "ethereum",
    tokens: {
      USDC: process.env.BASE_USDC_TOKEN,
      USDT: process.env.BASE_USDT_TOKEN,
      FLOWER: process.env.BASE_DEPOSIT_TOKEN,
    },
  },
  RONIN: {
    rpc: process.env.RONIN_RPC,
    treasuryWallet: process.env.RONIN_TREASURY_WALLET || process.env.TREASURY_WALLET,
    nativeCoingeckoId: "ronin",
    tokens: {
      USDC: process.env.RONIN_USDC_TOKEN,
      FLOWER: process.env.FLOWER_TOKEN,
    },
  },
};

// Conservative static fallback if live estimation fails for any reason
// (RPC hiccup, price API down, etc.) — never block a withdrawal outright.
const FALLBACK_FEES = {
  BASE: 0.02,
  RONIN: 1.0,
};

// Safety margin on top of the raw estimate — gas price can tick up between
// estimate and actual send, and this avoids the treasury eating the diff.
const SAFETY_MARGIN = 1.15;

// estimateGas never actually sends anything, it just simulates the call
// to measure gas units — safe to use the treasury's own address as the
// dry-run sender.
async function estimateGasUnits({ provider, contractAddress, fromAddress, toAddress, amountWei }) {
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
  return contract.transfer.estimateGas(toAddress, amountWei, { from: fromAddress });
}

/**
 * Estimate the real network fee for withdrawing `asset` on `chain`,
 * expressed in units of that same asset (so it can be deducted directly
 * from the withdrawal amount).
 *
 * @param chain     - "BASE" | "RONIN"
 * @param asset     - "USDC" | "USDT" | "FLOWER"
 * @param toAddress - destination address (used for a realistic gas estimate)
 * @param amount    - withdrawal amount (used to build a realistic estimateGas call)
 */
export async function estimateNetworkFee({ chain, asset, toAddress, amount }) {
  const chainKey = (chain || "").toUpperCase();
  const config = CHAIN_CONFIG[chainKey];

  const fallback = FALLBACK_FEES[chainKey] ?? 0.02;

  if (!config || !config.rpc || !config.treasuryWallet) {
    console.warn(`[gasEstimation] missing config for ${chainKey} — using fallback fee`);
    return { fee: fallback, estimated: false, chain: chainKey, asset };
  }

  const contractAddress = config.tokens[asset];
  if (!contractAddress) {
    console.warn(`[gasEstimation] no contract for ${asset} on ${chainKey} — using fallback fee`);
    return { fee: fallback, estimated: false, chain: chainKey, asset };
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.rpc);
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

    const decimals = await contract.decimals();
    const amountWei = ethers.parseUnits(
      (amount || 1).toFixed(Number(decimals)),
      decimals
    );

    const [gasUnits, feeData, nativePriceUsd] = await Promise.all([
      estimateGasUnits({
        provider,
        contractAddress,
        fromAddress: config.treasuryWallet,
        toAddress: toAddress || config.treasuryWallet,
        amountWei,
      }),
      provider.getFeeData(),
      priceAggregator.getReferencePrice(config.nativeCoingeckoId, "usd"),
    ]);

    const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (!feePerGas) throw new Error("no gas price data from provider");

    const nativeCostWei = gasUnits * feePerGas;
    const nativeCostEther = parseFloat(ethers.formatEther(nativeCostWei));

    if (!nativePriceUsd || nativePriceUsd <= 0) {
      throw new Error(`no live price for ${config.nativeCoingeckoId}`);
    }

    const usdCost = nativeCostEther * nativePriceUsd;

    let feeInAsset;
    if (asset === "FLOWER") {
      const flowerUsdRate = await getFlowerUsdtRate();
      if (!flowerUsdRate || flowerUsdRate <= 0) {
        throw new Error("no live FLOWER/USD rate");
      }
      feeInAsset = usdCost / flowerUsdRate;
    } else {
      // USDC/USDT ≈ 1:1 with USD
      feeInAsset = usdCost;
    }

    feeInAsset = feeInAsset * SAFETY_MARGIN;

    // Round up to 6 decimals, matching stablecoin/FLOWER precision elsewhere —
    // rounding up (not down) so the treasury is never short after the real send.
    feeInAsset = Math.ceil(feeInAsset * 1_000_000) / 1_000_000;

    return {
      fee: feeInAsset,
      estimated: true,
      chain: chainKey,
      asset,
      nativeCostEther,
      nativeCurrency: chainKey === "BASE" ? "ETH" : "RON",
      usdCost,
    };
  } catch (err) {
    console.error(`[gasEstimation] live estimate failed for ${chainKey} ${asset}, using fallback:`, err.message);
    return { fee: fallback, estimated: false, chain: chainKey, asset, error: err.message };
  }
}
