// src/services/fx/gasEstimator.js
//
// Estimates the real gas cost of a stablecoin sweep/transfer on Base or
// Ronin, and converts that cost to USD by quoting the native token
// against USDC directly on the chain's own DEX router (Katana on Ronin,
// a Uniswap-V2-compatible router on Base) — not a third-party price feed.
//
// This is what gets folded into the FX rate so the platform doesn't
// silently lose money covering gas on every swap.

import { ethers } from 'ethers';
import { UNISWAP_V2_ROUTER_ABI } from '../../../config/abi/uniswapV2.js';

const WETH_ABI = ['function deposit() payable', 'function balanceOf(address) view returns (uint256)'];

const CHAIN_GAS_CONFIG = {
  base: {
    rpcUrl: () => process.env.BASE_RPC || 'https://mainnet.base.org',
    routerAddress: () => process.env.BASE_ROUTER,
    nativeDecimals: 18,
    quoteToken: () => process.env.BASE_USDC_TOKEN || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    wrappedNative: () => process.env.BASE_WETH || '0x4200000000000000000000000000000000000006',
    // ERC20 transfer ~65k gas; sweep contracts can run higher — pad to 100k for safety
    gasUnits: 100_000n,
  },
  ronin: {
    rpcUrl: () => process.env.RONIN_RPC || 'https://api.roninchain.com/rpc',
    routerAddress: () => process.env.KATANA_ROUTER,
    nativeDecimals: 18,
    quoteToken: () => process.env.USDC_TOKEN || '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc',
    wrappedNative: () => process.env.WRON_TOKEN || '0xa959726154953bae111746e265e6d754f48570e',
    gasUnits: 100_000n,
  },
};

const _providerCache = {};
function getProvider(chainKey) {
  if (!_providerCache[chainKey]) {
    _providerCache[chainKey] = new ethers.JsonRpcProvider(CHAIN_GAS_CONFIG[chainKey].rpcUrl());
  }
  return _providerCache[chainKey];
}

/**
 * Returns the estimated cost, in USD (USDC-denominated), of one sweep/
 * transfer transaction on the given chain right now — real gas price x
 * gas units, converted to USD via the chain's own router quote.
 *
 * Falls back to 0 (no gas adjustment) if the router quote fails, so a
 * DEX hiccup never blocks a swap — it just means that one swap doesn't
 * get the gas adjustment applied.
 */
export async function estimateGasCostUSD(chain) {
  const config = CHAIN_GAS_CONFIG[chain?.toLowerCase()];
  if (!config) throw new Error(`Unsupported chain for gas estimation: ${chain}`);

  try {
    const provider = getProvider(chain.toLowerCase());

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
    if (!gasPrice) return 0;

    const gasCostNativeWei = gasPrice * config.gasUnits;

    const routerAddress = config.routerAddress();
    if (!routerAddress) return 0; // no router configured — skip gas adjustment

    const router = new ethers.Contract(routerAddress, UNISWAP_V2_ROUTER_ABI, provider);
    const path = [config.wrappedNative(), config.quoteToken()];

    const amountsOut = await router.getAmountsOut(gasCostNativeWei, path);
    // amountsOut[1] is in the quote token's own decimals (USDC = 6)
    const gasCostUSD = parseFloat(ethers.formatUnits(amountsOut[1], 6));

    return gasCostUSD;
  } catch (err) {
    console.error(`[GAS ESTIMATOR] ${chain} estimate failed, defaulting to 0:`, err.message);
    return 0;
  }
}
