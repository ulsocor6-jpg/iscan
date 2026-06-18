// config/chains/ronin.js
//
// Same env vars and on-chain addresses as before (flower.js + katana.js) —
// just reshaped into the generic adapter config so RoninAdapter and
// BaseAdapter are structurally identical objects. No behavior change for
// existing Ronin/Flower/Katana flows.

import { UNISWAP_V2_ROUTER_ABI, ERC20_ABI } from "../abi/uniswapV2.js";
import { deriveRoninAddress } from "../../src/services/hdWalletService.js";

const PLATFORM_FEE = Number(process.env.FLOWER_PLATFORM_FEE ?? 2);
const MIN_CONFIRMATIONS = Number(process.env.FLOWER_MIN_CONFIRMATIONS ?? 12);

export default {
  chainLabel: "RONIN",
  dexType: "EVM_V2",
  chainIdHex: "0x7e4",

  rpcUrl: process.env.RONIN_RPC,

  routerAddress: process.env.KATANA_ROUTER,
  routerAbi: UNISWAP_V2_ROUTER_ABI,
  erc20Abi: ERC20_ABI,

  depositTokenAddress: process.env.FLOWER_TOKEN,
  depositTokenSymbol: "FLOWER",
  depositTokenDecimals: 18,

  quoteTokenAddress: process.env.USDC_TOKEN || "0x0b7007c13325c48911f73a2dad5fa5dcbf808adc",
  quoteTokenSymbol: "USDC",
  quoteTokenDecimals: 6,

  treasuryWallet: process.env.TREASURY_WALLET,
  treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY,

  platformFeePercent: PLATFORM_FEE,
  minConfirmations: MIN_CONFIRMATIONS,
  slippageBps: 200,        // 2%
  deadlineSeconds: 600,    // 5 min

  deriveAddress: deriveRoninAddress
};
