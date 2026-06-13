import crypto from "crypto";
import { getRate } from "./rateProvider.js";
import { getCache, setCache } from "./fxCache.js";
import {
  validateRate,
  validateFxRequest
} from "./fxValidator.js";

const fxLocks = new Map();

export async function lockFxRate({
  amount,
  currency,
  transactionId
}) {

  // Validate request
  validateFxRequest({
    amount,
    currency
  });

  const lockId =
    transactionId ||
    crypto.randomUUID();

  // STEP 1: Cache lookup
  const cachedRate =
    getCache(currency);

  let rate = cachedRate;

  // STEP 2: Fetch live rate if needed
  if (!rate) {
    rate = await getRate(currency);

    validateRate(rate);

    setCache(currency, rate);
  }

  const phpAmount =
    parseFloat(
      (amount * rate).toFixed(2)
    );

  const lock = {
    lockId,
    currency,
    rate,
    phpAmount,
    createdAt: Date.now(),
    source: "coingecko",
    locked: true
  };

  fxLocks.set(lockId, lock);

  return lock;
}

export function getFxLock(lockId) {
  return fxLocks.get(lockId);
}
