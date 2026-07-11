// src/services/treasury/treasuryLiquidityService.js
//
// Computes a safe "withdrawal cap" per chain/asset from live treasury
// balances — deliberately NOT exposed as "our balance" to users, framed
// only as a max-withdrawal-right-now figure. Applies a small safety
// buffer so displayed caps never promise slightly more than what's
// actually available once gas/timing drift is accounted for.

import { getAllBalancesForAddress } from "../onchainBalanceService.js";

const SAFETY_BUFFER_PCT = 0.05; // hold back 5% as a buffer
const CACHE_TTL_MS = 20_000;    // 20s cache — avoids hammering RPC on every page load

let _cache = null;
let _cacheAt = 0;

const TREASURY_WALLETS = {
  BASE:  process.env.BASE_TREASURY_WALLET,
  RONIN: process.env.RONIN_TREASURY_WALLET || process.env.TREASURY_WALLET,
};

// Which assets to expose a cap for, per chain — mirrors what
// cryptoWithdrawalController.js actually allows.
const CAP_ASSETS = {
  BASE:  ["USDC", "USDT", "FLOWER"],
  RONIN: ["USDC", "FLOWER"],
};

function applyBuffer(rawBalance) {
  if (typeof rawBalance !== "number" || rawBalance <= 0) return 0;
  const capped = rawBalance * (1 - SAFETY_BUFFER_PCT);
  return Math.floor(capped * 1_000_000) / 1_000_000; // truncate to 6 decimals
}

export async function getWithdrawalCaps() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) {
    return _cache;
  }

  const result = {};

  await Promise.all(
    Object.entries(TREASURY_WALLETS).map(async ([chainKey, address]) => {
      if (!address) {
        result[chainKey] = null;
        return;
      }
      try {
        const balances = await getAllBalancesForAddress(chainKey, address);
        const caps = {};
        for (const asset of CAP_ASSETS[chainKey] || []) {
          caps[asset] = applyBuffer(balances[asset]);
        }
        result[chainKey] = caps;
      } catch (err) {
        console.error(`[treasuryLiquidityService] failed for ${chainKey}:`, err.message);
        result[chainKey] = null;
      }
    })
  );

  _cache = result;
  _cacheAt = now;
  return result;
}
