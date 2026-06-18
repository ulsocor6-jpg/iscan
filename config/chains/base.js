// config/chains/base.js
//
// ⚠️ TWO THINGS STILL NEED CONFIRMING BEFORE THIS GOES LIVE ⚠️
//
// 1. ROUTER / DEX — this file assumes a Uniswap-V2-compatible router
//    (BaseSwap, SushiSwap's Base deployment, a plain Uniswap V2 fork).
//    If you're routing through Aerodrome or Uniswap V3 on Base instead,
//    the swap call shape is different and this needs EvmV3DexAdapter /
//    a Solidly-style adapter instead of EvmV2DexAdapter — tell me which
//    DEX and I'll add it; nothing else in the pipeline changes.
//
// 2. DEPOSIT TOKEN — what are users actually depositing on Base? Is there
//    a "FLOWER on Base" bridged/native token, or a different token
//    entirely? BASE_DEPOSIT_TOKEN below is a placeholder env var.
//
// quoteTokenAddress (USDC) IS verified — this is Circle's official native
// USDC contract on Base mainnet (chain ID 8453), confirmed against
// developers.circle.com as of writing. Double-check it against your own
// RPC before moving real funds, as a matter of policy, not because I'm
// unsure of it.

import { UNISWAP_V2_ROUTER_ABI, ERC20_ABI } from "../abi/uniswapV2.js";
import { deriveRoninAddress as deriveEvmAddress } from "../../src/services/hdWalletService.js";
// ^ Ronin and Base are both plain EVM chains (secp256k1, 0x... addresses),
// so the same HD derivation function works for both — it doesn't actually
// do anything Ronin-specific. Renamed on import for clarity. If
// hdWalletService.js turns out to hardcode a Ronin chain ID anywhere
// internally, let me know and I'll split it into a chain-agnostic version.

const PLATFORM_FEE = Number(process.env.BASE_PLATFORM_FEE ?? 2);
const MIN_CONFIRMATIONS = Number(process.env.BASE_MIN_CONFIRMATIONS ?? 20);
// Base blocks land ~every 2s, so 20 confirmations ≈ 40s — much faster than
// Ronin's 12-confirmation wait. Tune to your own risk tolerance for reorgs.

export default {
  chainLabel: "BASE",
  dexType: "EVM_V2", // change if using Aerodrome / Uniswap V3 — see note above
  chainIdHex: "0x2105", // Base mainnet (8453)

  rpcUrl: process.env.BASE_RPC, // e.g. https://mainnet.base.org for dev, a paid provider (Alchemy/QuickNode) for production

  routerAddress: process.env.BASE_ROUTER, // TODO: confirm DEX + router address
  routerAbi: UNISWAP_V2_ROUTER_ABI,
  erc20Abi: ERC20_ABI,

  depositTokenAddress: process.env.BASE_DEPOSIT_TOKEN, // TODO: which token are users depositing?
  depositTokenSymbol: process.env.BASE_DEPOSIT_TOKEN_SYMBOL || "BASE_TOKEN", // TODO: rename
  depositTokenDecimals: Number(process.env.BASE_DEPOSIT_TOKEN_DECIMALS ?? 18),

  quoteTokenAddress:
    process.env.BASE_USDC_TOKEN || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // verified native USDC on Base
  quoteTokenSymbol: "USDC",
  quoteTokenDecimals: 6,

  treasuryWallet: process.env.BASE_TREASURY_WALLET,
  treasuryPrivateKey: process.env.BASE_TREASURY_PRIVATE_KEY,

  platformFeePercent: PLATFORM_FEE,
  minConfirmations: MIN_CONFIRMATIONS,
  slippageBps: Number(process.env.BASE_SLIPPAGE_BPS ?? 200),
  deadlineSeconds: 300,

  deriveAddress: deriveEvmAddress
};
