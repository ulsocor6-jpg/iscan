// adapters/index.js
//
// Single place that knows how to build an adapter from a chain key.
// Generic services call getAdapter("RONIN") / getAdapter("BASE") and never
// touch config or ethers directly. Adding a third chain later means adding
// one entry here + one config/chains/*.js file — no changes to any service.

import { EvmV2DexAdapter } from "./EvmV2DexAdapter.js";
import roninConfig from "../config/chains/ronin.js";
import baseConfig from "../config/chains/base.js";

const CHAIN_CONFIGS = {
  RONIN: roninConfig,
  BASE: baseConfig
};

const instances = new Map();

function buildAdapter(chainConfig) {
  switch (chainConfig.dexType) {
    case "EVM_V2":
      return new EvmV2DexAdapter(chainConfig);
    default:
      throw new Error(
        `Unsupported dexType "${chainConfig.dexType}" for chain "${chainConfig.chainLabel}"`
      );
  }
}

export function getAdapter(chainKey) {
  const key = String(chainKey).toUpperCase();

  if (!instances.has(key)) {
    const config = CHAIN_CONFIGS[key];
    if (!config) {
      throw new Error(
        `Unknown chain "${chainKey}". Supported: ${Object.keys(CHAIN_CONFIGS).join(", ")}`
      );
    }
    instances.set(key, buildAdapter(config));
  }

  return instances.get(key);
}

export function supportedChains() {
  return Object.keys(CHAIN_CONFIGS);
}

export default { getAdapter, supportedChains };
