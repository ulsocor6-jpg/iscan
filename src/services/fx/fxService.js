import { lockFxRate, getFxLock } from "./lockedFxEngine.js";
import { logFxEvent } from "./fxAudit.js";
import { getRate } from "./rateProvider.js";

export async function convertToPHP(
  amount,
  currency
) {
  if (
    !currency ||
    currency.toUpperCase() === "PHP"
  ) {
    return {
      phpAmount: Number(amount),
      rate: 1
    };
  }

  const rate =
    await getRate(currency);

  if (!rate) {
    throw new Error(
      `Unable to fetch FX rate for ${currency}`
    );
  }

  return {
    phpAmount: parseFloat(
      (Number(amount) * Number(rate))
      .toFixed(2)
    ),
    rate
  };
}

export async function convertAndLock({
  amount,
  currency,
  transactionId
}) {
  const lock = await lockFxRate({
    amount,
    currency,
    transactionId
  });

  await logFxEvent({
    type: "FX_LOCKED",
    transactionId: lock.lockId,
    rate: lock.rate,
    phpAmount: lock.phpAmount
  });

  return lock;
}

export {
  getFxLock
};

export default {
  convertToPHP,
  convertAndLock,
  getFxLock
};
