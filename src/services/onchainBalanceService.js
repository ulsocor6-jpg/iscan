// src/services/onchainBalanceService.js
//
// Queries REAL on-chain token balances directly from each chain's RPC —
// not the Ledger, not Wallet.balances cache.

import { ethers } from "ethers";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const CHAINS = {
  ETHEREUM: {
    rpcUrl: process.env.ETHEREUM_RPC || "https://eth.llamarpc.com",
    chainIdHex: "0x1",
    tokens: {
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
  },

  POLYGON: {
    rpcUrl: process.env.POLYGON_RPC || "https://polygon-rpc.com",
    chainIdHex: "0x89",
    tokens: {
      USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    },
  },

  BASE: {
    rpcUrl: process.env.BASE_BALANCE_RPC || process.env.BASE_RPC || "https://base.llamarpc.com",
    chainIdHex: "0x2105",
    tokens: {
      USDC:
        process.env.BASE_USDC_TOKEN ||
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

      USDT:
        process.env.BASE_USDT_TOKEN ||
        "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",

      FLOWER:
        process.env.BASE_FLOWER_TOKEN ||
        process.env.FLOWER_TOKEN ||
        "0x3e12b9d6a4d12cd9b4a6d613872d0eb32f68b380",
    },
  },

  RONIN: {
    rpcUrl: process.env.RONIN_BALANCE_RPC || process.env.RONIN_RPC || "https://api.roninchain.com/rpc",
    chainIdHex: "0x7e4",
    tokens: {
      FLOWER:
        process.env.RONIN_FLOWER_TOKEN ||
        process.env.FLOWER_TOKEN ||
        "0x3e12b9d6a4d12cd9b4a6d613872d0eb32f68b380",

      USDC:
        process.env.USDC_TOKEN ||
        "0x0b7007c13325c48911f73a2dad5fa5dcbf808adc",

      // No canonical USDT contract exists on Ronin mainnet — Katana's own
      // supported asset list is WETH/AXS/SLP/RON/USDC only. The key is
      // omitted entirely (not set to null — null means "native currency
      // alias", which USDT is not) so it's never queried and never shown.
      //
      // AXS/SLP dropped from live polling (2026-07-11) — not needed for
      // treasury display, cuts 2 RPC calls per Ronin balance check.
    },
  },
};

const _providerCache = {};

function getProvider(chainKey) {
  if (!_providerCache[chainKey]) {
    const chainIdHex = CHAINS[chainKey].chainIdHex;

    const network = ethers.Network.from(parseInt(chainIdHex, 16));

    _providerCache[chainKey] = new ethers.JsonRpcProvider(
      CHAINS[chainKey].rpcUrl,
      network,
      {
        staticNetwork: network,
      }
    );
  }

  return _providerCache[chainKey];
}

const _decimalsCache = {};

async function getDecimals(chainKey, tokenAddress) {
  const key = `${chainKey}:${tokenAddress}`;

  if (_decimalsCache[key] !== undefined) {
    return _decimalsCache[key];
  }

  const provider = getProvider(chainKey);

  const contract = new ethers.Contract(
    tokenAddress,
    ERC20_ABI,
    provider
  );

  const decimals = await contract.decimals();

  _decimalsCache[key] = decimals;

  return decimals;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`${label} timed out after ${ms}ms`)
          ),
        ms
      )
    ),
  ]);
}

export async function getTokenBalance(
  chainKey,
  address,
  tokenSymbol
) {
  const chain = CHAINS[chainKey];

  if (!chain) {
    throw new Error(`Unsupported chain: ${chainKey}`);
  }

  const tokenAddress = chain.tokens[tokenSymbol];

  if (tokenAddress === null) {
    return getNativeBalance(chainKey, address);
  }

  if (!tokenAddress) {
    return null;
  }

  const provider = getProvider(chainKey);

  const contract = new ethers.Contract(
    tokenAddress,
    ERC20_ABI,
    provider
  );

  const [raw, decimals] = await withTimeout(
    Promise.all([
      contract.balanceOf(address),
      getDecimals(chainKey, tokenAddress),
    ]),
    4000,
    `${chainKey} ${tokenSymbol} balanceOf`
  );

  return parseFloat(
    ethers.formatUnits(raw, decimals)
  );
}

export async function getNativeBalance(
  chainKey,
  address
) {
  const provider = getProvider(chainKey);

  const raw = await withTimeout(
    provider.getBalance(address),
    4000,
    `${chainKey} native balance`
  );

  return parseFloat(
    ethers.formatEther(raw)
  );
}

export async function getAllBalancesForAddress(
  chainKey,
  address
) {
  const chain = CHAINS[chainKey];

  if (!chain) {
    throw new Error(`Unsupported chain: ${chainKey}`);
  }

  const tokenSymbols = Object.keys(chain.tokens);

  // Run native + all token balance calls in parallel instead of
  // sequentially — a single slow/dead RPC used to cascade into a
  // 10s wait PER call. Now every call races the same timeout at once.
  const [native, ...tokenBalances] = await Promise.all([
    getNativeBalance(chainKey, address).catch((err) => {
      console.error(`[DEBUG] ${chainKey} native balance failed:`, err.message);
      return null;
    }),
    ...tokenSymbols.map((sym) =>
      getTokenBalance(chainKey, address, sym).catch((err) => {
        console.error(`[DEBUG] ${chainKey} ${sym} balance failed:`, err.message);
        return null;
      })
    ),
  ]);

  const result = {
    native,
  };

  tokenSymbols.forEach((sym, i) => {
    result[sym] = tokenBalances[i];
  });

  return result;
}

// Chains actually offered in the product today. Ethereum/Polygon are
// derived on every wallet (see hdWalletService.deriveUserWallets) but are
// not surfaced anywhere in the UI — skip querying them here so we don't
// spend RPC round trips (and rate-limit budget) on chains nobody uses.
const LIVE_CHAINS = ["BASE", "RONIN"];

export async function getLiveBalancesForWallet(wallet) {
  const results = {};

  await Promise.all(
    (wallet.chainAddresses || []).map(async (ca) => {
      const chainKey = ca.chain?.toUpperCase();

      if (!LIVE_CHAINS.includes(chainKey) || !CHAINS[chainKey] || !ca.address) {
        return;
      }

      try {
        results[chainKey] = {
          address: ca.address,
          ...(await getAllBalancesForAddress(
            chainKey,
            ca.address
          )),
        };
      } catch (err) {
        results[chainKey] = {
          address: ca.address,
          error: err.message,
        };
      }
    })
  );

  return results;
}

export const SUPPORTED_LIVE_CHAINS =
  Object.keys(CHAINS);
